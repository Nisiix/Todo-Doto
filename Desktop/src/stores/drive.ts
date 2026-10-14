import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
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
import { compareText } from '@/i18n'

export type DriveStatus = 'unconfigured' | 'disconnected' | 'connecting' | 'connected'

/**
 * Stato del collegamento a Google Drive (per macchina: account e token sono
 * dell'utente) e della cartella sincronizzata (per workspace: solo struttura).
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
  const nodes = computed(() => ws.drive.nodes)
  const rootName = computed(() => ws.drive.rootName)
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

  async function buildClient() {
    if (!auth.value?.clientId) {
      client.value = null
      status.value = 'unconfigured'
      return
    }
    client.value = new DriveClient(await getHttp(), { clientId: auth.value.clientId, clientSecret: auth.value.clientSecret }, auth.value.tokens, persistTokens)
    status.value = auth.value.tokens ? 'connected' : 'disconnected'
  }

  async function init() {
    if (loaded.value) return
    auth.value = await loadDriveAuth(session.localSecret)
    await buildClient()
    loaded.value = true
  }

  /** Salva l'ID client (e l'eventuale segreto) creati nella Google Cloud Console. */
  async function configure(clientId: string, clientSecret: string) {
    auth.value = { clientId: clientId.trim(), clientSecret: clientSecret.trim(), tokens: null, account: null }
    await saveDriveAuth(auth.value, session.localSecret)
    await buildClient()
  }

  /** Flusso OAuth: browser di sistema → consenso → redirect sul ricevitore locale. */
  async function connect() {
    if (!client.value || !auth.value) return
    error.value = ''
    status.value = 'connecting'
    try {
      const fs = await getFs()
      const port = await fs.oauthStart()
      const redirectUri = `http://127.0.0.1:${port}/callback`
      const { verifier, challenge } = await createPkce()
      const state = randomState()
      await fs.openExternal(buildAuthUrl({ clientId: auth.value.clientId, redirectUri, state, challenge }), 'link')
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
    status.value = auth.value?.clientId ? 'disconnected' : 'unconfigured'
  }

  /** Imposta la cartella da replicare (link o id) e sincronizza. */
  async function setRootFolder(linkOrId: string) {
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
      await ws.writeDrive({ schema: 1, rootFolderId: rootId, rootName: info.name, nodes: list, syncedAt: nowIso(), syncedBy: ws.currentUser?.id ?? null })
      ui.toast(common.drive.synced(list.length), 'success')
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      ui.toast(common.drive.syncFailed(error.value), 'error', undefined, 6000)
    } finally {
      syncing.value = false
    }
  }

  async function clearRootFolder() {
    await ws.writeDrive({ schema: 1, rootFolderId: null, rootName: '', nodes: [], syncedAt: null, syncedBy: null })
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
    syncedAt: computed(() => ws.drive.syncedAt),
    clientId: computed(() => auth.value?.clientId ?? ''),
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
