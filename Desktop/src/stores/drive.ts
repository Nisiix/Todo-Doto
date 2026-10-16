import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { getFs } from '@/services/fs'
import { getHttp } from '@/services/http'
import { loadDriveAuth, saveDriveAuth, type DriveAuthFile } from '@/services/config'
import { DriveClient, DriveError, buildAuthUrl, createPkce, parseFolderId, randomState } from '@/services/drive'
import { nowIso } from '@/services/ids'
import { useSessionStore } from './session'
import { useWorkspaceStore } from './workspace'
import { useUiStore } from './ui'
import { DRIVE_FOLDER_MIME, type DriveNode } from '@/types'
import { common } from '@/i18n/common'
import { compareText, defineMessages } from '@/i18n'

const M = defineMessages({
  it: { adminOnly: 'Solo un amministratore sceglie la cartella di Drive del workspace.' },
  en: { adminOnly: 'Only an administrator chooses the workspace Drive folder.' },
})

export type DriveStatus = 'unconfigured' | 'disconnected' | 'connecting' | 'connected'

/** Struttura sincronizzata da un utente non amministratore con il proprio account (resta sul suo PC). */
interface PersonalDrive {
  rootFolderId: string
  rootName: string
  nodes: DriveNode[]
  syncedAt: string
}

/**
 * Stato del collegamento a Google Drive (per macchina: account e token sono
 * dell'utente) e della cartella sincronizzata (per workspace: solo struttura).
 *
 * L'accesso ai documenti dipende dai permessi dell'account Google di ciascuno:
 * ognuno collega il proprio account (condividere il token di un altro gli
 * darebbe il Drive di quella persona). Ciò che si condivide lo decide un
 * amministratore: il client OAuth (così gli altri non devono crearne uno nella
 * Google Cloud Console) e la cartella da replicare (anche toglierla).
 *
 * Risincronizzare lo può fare chiunque, e vale per sé: ognuno vede i file a cui
 * il proprio account ha accesso. La struttura sincronizzata da un
 * amministratore è quella del workspace (la vedono tutti); quella di un altro
 * utente resta solo sul suo PC e, per lui, prende il posto di quella condivisa.
 */
export const useDriveStore = defineStore('drive', () => {
  const session = useSessionStore()
  const ws = useWorkspaceStore()
  const ui = useUiStore()

  const auth = ref<DriveAuthFile | null>(null)
  const client = shallowRef<DriveClient | null>(null)
  const status = ref<DriveStatus>('unconfigured')
  const syncing = ref(false)
  const syncProgress = ref(0)
  const error = ref('')
  const loaded = ref(false)

  const account = computed(() => auth.value?.account ?? null)
  /** Struttura sincronizzata da questo utente con il proprio account (sul PC), per la cartella del workspace. */
  const personal = ref<PersonalDrive | null>(null)
  const mine = computed(() => (personal.value && personal.value.rootFolderId === ws.drive.rootFolderId ? personal.value : null))
  const nodes = computed(() => mine.value?.nodes ?? ws.drive.nodes)
  const rootName = computed(() => mine.value?.rootName || ws.drive.rootName)
  const rootFolderId = computed(() => ws.drive.rootFolderId)
  const nodesById = computed(() => Object.fromEntries(nodes.value.map((n) => [n.id, n])))
  const childrenOf = (parentId: string | null) =>
    nodes.value
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => Number(b.mimeType === DRIVE_FOLDER_MIME) - Number(a.mimeType === DRIVE_FOLDER_MIME) || compareText(a.name, b.name))
  const isFolder = (n: DriveNode) => n.mimeType === DRIVE_FOLDER_MIME
  const files = computed(() => nodes.value.filter((n) => !isFolder(n)))

  /** Percorso leggibile di un nodo dentro la cartella sincronizzata. */
  function pathOf(id: string): string {
    const parts: string[] = []
    let cur: DriveNode | undefined = nodesById.value[id]
    while (cur) {
      parts.unshift(cur.name)
      cur = cur.parentId ? nodesById.value[cur.parentId] : undefined
    }
    return parts.join(' / ')
  }

  async function persistTokens(tokens: DriveAuthFile['tokens']) {
    if (!auth.value) return
    auth.value = { ...auth.value, tokens, account: tokens ? auth.value.account : null }
    await saveDriveAuth(auth.value, session.localSecret)
    status.value = tokens ? 'connected' : 'disconnected'
  }

  /** Client OAuth da usare su questo PC: quello configurato qui, altrimenti quello del workspace. */
  function effectiveClient(): { clientId: string; clientSecret: string } | null {
    if (auth.value?.clientId) return { clientId: auth.value.clientId, clientSecret: auth.value.clientSecret }
    const id = ws.drive.oauthClientId.trim()
    return id ? { clientId: id, clientSecret: ws.drive.oauthClientSecret } : null
  }
  /** Il client viene dal workspace (impostato da un amministratore), non da questo PC. */
  const sharedClient = computed(() => !auth.value?.clientId && !!ws.drive.oauthClientId.trim())

  async function buildClient() {
    const oauth = effectiveClient()
    if (!oauth) {
      client.value = null
      status.value = 'unconfigured'
      return
    }
    client.value = new DriveClient(await getHttp(), oauth, auth.value?.tokens ?? null, persistTokens)
    status.value = auth.value?.tokens ? 'connected' : 'disconnected'
  }

  // --- struttura personale (per PC e workspace) -------------------------------------
  const personalPath = async () => {
    const fs = await getFs()
    return fs.join(await fs.appDataDir(), 'drive', `${ws.meta?.id ?? 'ws'}.json`)
  }
  async function loadPersonal() {
    personal.value = null
    if (!ws.meta) return
    try {
      const fs = await getFs()
      const path = await personalPath()
      if (await fs.exists(path)) personal.value = JSON.parse(await fs.readText(path)) as PersonalDrive
    } catch {
      personal.value = null
    }
  }
  async function savePersonal(data: PersonalDrive | null) {
    personal.value = data
    const fs = await getFs()
    const path = await personalPath()
    if (data) {
      await fs.mkdir(await fs.join(await fs.appDataDir(), 'drive'))
      await fs.writeTextAtomic(path, JSON.stringify(data))
    } else if (await fs.exists(path)) await fs.remove(path)
  }
  watch(
    () => ws.meta?.id,
    () => void (loaded.value && loadPersonal()),
  )

  async function init() {
    if (loaded.value) return
    await loadPersonal()
    auth.value = await loadDriveAuth(session.localSecret)
    // Amministratore con il client configurato solo su questo PC (versioni precedenti): lo si
    // condivide con il workspace di rete, così gli altri devono solo collegare il proprio account
    if (ws.isNetwork && ws.isAdmin && auth.value?.clientId && !ws.drive.oauthClientId.trim()) {
      await ws.writeDrive({ ...ws.drive, oauthClientId: auth.value.clientId, oauthClientSecret: auth.value.clientSecret })
    }
    await buildClient()
    loaded.value = true
  }
  // Il client del workspace può arrivare (o cambiare) dopo: aprendo il workspace o quando lo imposta un amministratore
  watch(
    () => [ws.drive.oauthClientId, ws.drive.oauthClientSecret],
    () => void (loaded.value && !auth.value?.clientId && buildClient()),
  )

  /**
   * Salva l'ID client (e l'eventuale segreto) creati nella Google Cloud Console.
   * Un amministratore lo imposta per tutto il workspace: gli altri collegano solo il proprio account.
   */
  async function configure(clientId: string, clientSecret: string) {
    const id = clientId.trim()
    const secret = clientSecret.trim()
    if (ws.isAdmin) {
      await ws.writeDrive({ ...ws.drive, oauthClientId: id, oauthClientSecret: secret })
      // Su questo PC vale quello del workspace (niente copia locale da tenere allineata)
      auth.value = { clientId: '', clientSecret: '', tokens: null, account: null }
    } else auth.value = { clientId: id, clientSecret: secret, tokens: null, account: null }
    await saveDriveAuth(auth.value, session.localSecret)
    await buildClient()
  }

  /** Flusso OAuth: browser di sistema → consenso → redirect sul ricevitore locale. */
  async function connect() {
    const oauth = effectiveClient()
    if (!client.value || !oauth) return
    auth.value ??= { clientId: '', clientSecret: '', tokens: null, account: null }
    error.value = ''
    status.value = 'connecting'
    try {
      const fs = await getFs()
      const port = await fs.oauthStart()
      const redirectUri = `http://127.0.0.1:${port}/callback`
      const { verifier, challenge } = await createPkce()
      const state = randomState()
      await fs.openExternal(buildAuthUrl({ clientId: oauth.clientId, redirectUri, state, challenge }), 'link')
      const cb = await fs.oauthWait()
      if (cb.error) throw new DriveError(cb.error === 'access_denied' ? common.drive.accessCancelled : cb.error)
      if (!cb.code || cb.state !== state) throw new DriveError(common.drive.badState)
      await client.value.exchangeCode(cb.code, verifier, redirectUri)
      const who = await client.value.whoAmI()
      auth.value = { ...auth.value, tokens: auth.value.tokens, account: who }
      await saveDriveAuth(auth.value, session.localSecret)
      status.value = 'connected'
      ui.toast(common.drive.linkedAs(who.email), 'success')
    } catch (e) {
      status.value = auth.value?.tokens ? 'connected' : 'disconnected'
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function disconnect() {
    await client.value?.disconnect()
    if (auth.value) {
      auth.value = { ...auth.value, tokens: null, account: null }
      await saveDriveAuth(auth.value, session.localSecret)
    }
    status.value = effectiveClient() ? 'disconnected' : 'unconfigured'
  }

  /** Imposta la cartella da replicare (link o id) e sincronizza. */
  async function setRootFolder(linkOrId: string) {
    if (!ws.isAdmin) throw new DriveError(M.adminOnly)
    const id = parseFolderId(linkOrId)
    if (!id) throw new DriveError(common.drive.pasteFolder)
    if (!client.value) throw new DriveError(common.drive.linkFirst)
    const info = await client.value.folderInfo(id)
    if (info.mimeType !== DRIVE_FOLDER_MIME) throw new DriveError(common.drive.notAFolder)
    await ws.writeDrive({ ...ws.drive, rootFolderId: info.id, rootName: info.name, nodes: [], syncedAt: null, syncedBy: null })
    await sync()
  }

  /** Rilegge l'intera struttura della cartella e la salva nel workspace. */
  async function sync() {
    const c = client.value
    const rootId = ws.drive.rootFolderId
    if (!c || !rootId || syncing.value) return
    syncing.value = true
    syncProgress.value = 0
    error.value = ''
    try {
      const info = await c.folderInfo(rootId)
      const list = await c.walkFolder(rootId, (n) => (syncProgress.value = n))
      if (ws.isAdmin) {
        // Amministratore: diventa la struttura del workspace, quella che vedono tutti
        await ws.writeDrive({ ...ws.drive, schema: 1, rootFolderId: rootId, rootName: info.name, nodes: list, syncedAt: nowIso(), syncedBy: ws.currentUser?.id ?? null })
        await savePersonal(null)
      } else {
        // Gli altri: i file che vedono con il proprio account, solo per sé (su questo PC)
        await savePersonal({ rootFolderId: rootId, rootName: info.name, nodes: list, syncedAt: nowIso() })
      }
      ui.toast(common.drive.synced(list.length), 'success')
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      ui.toast(common.drive.syncFailed(error.value), 'error', undefined, 6000)
    } finally {
      syncing.value = false
    }
  }

  async function clearRootFolder() {
    if (!ws.isAdmin) return
    await ws.writeDrive({ ...ws.drive, schema: 1, rootFolderId: null, rootName: '', nodes: [], syncedAt: null, syncedBy: null })
  }

  // Cache dei contenuti scaricati, per non riscaricare a ogni apertura
  const cache = new Map<string, { bytes: Uint8Array; name: string; mime: string }>()

  /** Contenuto per l'anteprima (scaricato o esportato), con cache per versione. */
  async function fetchForPreview(fileId: string) {
    if (!client.value) throw new DriveError(common.drive.linkToView)
    const node = nodesById.value[fileId]
    const key = `${fileId}:${node?.modifiedTime ?? ''}`
    const hit = cache.get(key)
    if (hit) return hit
    const meta = node ?? (await client.value.folderInfo(fileId))
    const content = await client.value.fetchContent(meta)
    if (content.bytes.byteLength < 25 * 1024 * 1024) cache.set(key, content)
    return content
  }

  return {
    status,
    account,
    error,
    syncing,
    syncProgress,
    nodes,
    files,
    rootName,
    rootFolderId,
    nodesById,
    childrenOf,
    isFolder,
    pathOf,
    syncedAt: computed(() => mine.value?.syncedAt ?? ws.drive.syncedAt),
    /** La struttura mostrata è quella sincronizzata da questo utente (non quella del workspace). */
    personalView: computed(() => !!mine.value),
    clientId: computed(() => effectiveClient()?.clientId ?? ''),
    sharedClient,
    init,
    configure,
    connect,
    disconnect,
    setRootFolder,
    sync,
    clearRootFolder,
    fetchForPreview,
  }
})
