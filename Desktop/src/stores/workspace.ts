import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { WorkspaceStorage, type Signature } from '@/services/storage'
import { hashPassword, verifyPassword } from '@/services/crypto'
import { createEncryption, unwrapKey, wrapKey, type DataCipher } from '@/services/vault'
import { forgetPassword, hasRememberedPassword, recallPassword, rememberPassword } from '@/services/config'
import { newId, nowIso } from '@/services/ids'
import { useSessionStore } from './session'
import { useUiStore } from './ui'
import { useNotificationsStore } from './notifications'
import { useVpnStore } from './vpn'
import { useOutboxStore } from './outbox'
import { mailOutlook, mailSmtp, type MailMessage } from '@/services/office'
import { openSecret, sealSecret } from '@/services/mail'
import { diffProjects } from '@/services/changes'
import { EMPTY_STACK, MAIL_DEFAULTS, projectVisibility, type AiTool, type Milestone, type Stack, type Visibility } from '@/types'
import { applyStatusRules, firstLine } from '@/services/items'
import { MAX_HANDLED, normalizeSeq, planGitClose, subjectOf, taskCode, type GitCommit } from '@/services/gitLink'
import { pruneBlockers, wouldCycle } from '@/services/dependencies'
import type { BackupBundle, BackupInfo, BackupReason } from '@/services/backup'
import { detectStack, inferProjectsPath, samePath } from '@/services/projectScan'
import { explainFsError } from '@/services/fsErrors'
import { mergeStack } from '@/services/stackDoc'
import { findOffline, readOffline, removeOffline, saveOffline, type OfflineFile } from '@/services/offlineCache'
import { mergeProject, type MergeReport } from '@/services/merge3'
import { inGroup, roleFromGroups } from '@/services/domain'
import { pollInterval } from '@/services/polling'
import type {
  Attachment,
  AuditAction,
  AuditEntry,
  Bucket,
  DriveFile,
  Folder,
  Item,
  Label,
  MailSettings,
  MailTopic,
  PresenceFile,
  Project,
  Question,
  ReadinessFile,
  Role,
  TreeFile,
  User,
  WorkspaceMeta,
  WorkspaceMode,
} from '@/types'
import { common } from '@/i18n/common'
import { compareText } from '@/i18n'

/** Un collega (o l'utente corrente) che lavora a un task. */
export interface WorkingEntry {
  user: User
  project: Project
  item: Item
  since: string
}

/** Esito dell'invio delle modifiche fatte fuori ufficio, progetto per progetto. */
export interface OfflineSyncReport {
  project: string
  report: MergeReport
}

export type OpenResult = { ok: true } | { ok: false; needsPassword: true } | { ok: false; error: string }
export type WsStatus = 'closed' | 'opening' | 'locked' | 'open' | 'unreachable'

/** «Ci sto lavorando»: rinnovo dell'indicazione e oltre quanto senza rinnovo non vale più. */
export const PRESENCE_BEAT_MS = 10 * 60_000
export const PRESENCE_STALE_MS = 30 * 60_000
const BACKUP_FIRST_MS = 5000
const BACKUP_CHECK_MS = 60 * 60_000

export const useWorkspaceStore = defineStore('workspace', () => {
  const session = useSessionStore()
  const ui = useUiStore()
  const notifications = useNotificationsStore()

  // --- stato ----------------------------------------------------------------
  const storage = shallowRef<WorkspaceStorage | null>(null)
  const status = ref<WsStatus>('closed')
  const meta = ref<WorkspaceMeta | null>(null)
  const users = ref<User[]>([])
  const tree = ref<TreeFile>({ folders: [], labels: [] })
  const drive = ref<DriveFile>({ schema: 1, rootFolderId: null, rootName: '', syncedAt: null, syncedBy: null, nodes: [], oauthClientId: '', oauthClientSecret: '' })
  const audit = ref<AuditEntry[]>([])
  /** Copie di sicurezza presenti (la più recente per prima) ed eventuale errore dell'ultima automatica. */
  const backups = ref<BackupInfo[]>([])
  const backupError = ref<string | null>(null)
  const backupBusy = ref(false)
  /** Esito delle verifiche dei prerequisiti sui PC degli utenti (solo workspace di rete). */
  const readiness = ref<Record<string, ReadinessFile>>({})
  /** Chi lavora a cosa (workspace di rete): file presence/<idUtente>.json di ognuno. */
  const presence = ref<Record<string, PresenceFile>>({})
  /**
   * Fuori ufficio (cartella condivisa non raggiungibile): per i progetti
   * modificati su questo PC, com'erano all'ultimo allineamento. Al ritorno si
   * uniscono le modifiche (merge3) e l'elenco si svuota.
   */
  const offlineBase = ref<Record<string, Project>>({})
  /** Voci di cronologia scritte fuori ufficio, da aggiungere al ritorno. */
  let pendingAudit: AuditEntry[] = []
  /** Conflitti o task persi nell'ultimo invio delle modifiche fatte fuori ufficio (da mostrare). */
  const offlineReport = ref<OfflineSyncReport[] | null>(null)
  /** Aperto dalla copia su questo PC: la cartella condivisa non rispondeva. */
  let fromCache: OfflineFile | null = null
  /** Ora corrente, aggiornata ogni minuto: fa scadere le indicazioni non rinnovate. */
  const presenceNow = ref(Date.now())
  const projects = ref<Record<string, Project>>({})
  const lastError = ref<string | null>(null)
  /** La password del workspace di rete è ricordata (cifrata) su questo PC per questo utente. */
  const passwordRemembered = ref(false)

  /**
   * Password del workspace di rete usata in questa sessione (solo in memoria):
   * serve ad aprire la chiave dati se un amministratore attiva la cifratura
   * mentre il workspace è aperto. Si dimentica alla chiusura.
   */
  let sessionPassword: string | null = null
  /** Chiave dati del workspace (cifratura sul disco), se attiva o usata in passato. */
  let cipher: DataCipher | null = null

  let signature: Signature = {}
  let pollTimer: number | null = null
  let lastActivity = Date.now()
  /** Catena di controlli in corso: una nuova la sostituisce (niente controlli doppi). */
  let pollChain = 0
  const onActivity = () => (lastActivity = Date.now())
  let presenceTimer: number | null = null
  let backupTimer: number | null = null
  let unwatch: (() => void) | null = null
  let refreshing: Promise<void> | null = null
  let refreshQueued = false
  /** Cresce a ogni scrittura locale: una lettura iniziata prima non può sovrascrivere lo stato più nuovo. */
  let writeGen = 0
  function markLocalWrite(key: string) {
    signature[key] = ''
    writeGen++
  }

  // --- derivati -------------------------------------------------------------
  const identityKey = computed(() => `${session.identity.username}@${session.identity.hostname}`.toLowerCase())
  const currentUser = computed(() => {
    // Con l'accesso di dominio la stessa persona è lo stesso utente su qualunque PC
    const sid = session.identity.sid
    if (sid && meta.value?.domainLogin.enabled) {
      const bySid = users.value.find((u) => u.sid === sid)
      if (bySid) return bySid
    }
    return users.value.find((u) => `${u.username}@${u.hostname}`.toLowerCase() === identityKey.value) ?? null
  })
  const isAdmin = computed(() => meta.value?.mode === 'local' || currentUser.value?.role === 'admin')
  const isNetwork = computed(() => meta.value?.mode === 'network')
  /** Cartella dei progetti ricavata dalle cartelle dei progetti (per i workspace che non l'hanno salvata). */
  const inferredProjectsPath = computed(() => inferProjectsPath(Object.values(projects.value).map((p) => p.stack.sourcePath).filter(Boolean)))
  /** Cartella dei progetti da usare: quella del workspace, altrimenti quella ricavata dai progetti. */
  const projectsRoot = computed(() => meta.value?.projectsPath || inferredProjectsPath.value)
  /** Solo gli amministratori eliminano definitivamente (elementi e progetti nel cestino, svuota cestino). */
  const canPurge = computed(() => isAdmin.value)
  const isCleaner = computed(() => currentUser.value?.role === 'cleaner')
  /**
   * Chi può spostare nel cestino un elemento da fare: l'assegnatario, il
   * creatore se non è assegnato a nessuno, i Cleaner e gli amministratori.
   */
  function canTrashItem(item: Pick<Item, 'assigneeId' | 'createdBy' | 'bucket'>) {
    if (isAdmin.value || isCleaner.value) return true
    const me = currentUser.value?.id
    if (!me) return false
    return item.assigneeId ? item.assigneeId === me : item.createdBy === me
  }
  const usersById = computed(() => Object.fromEntries(users.value.map((u) => [u.id, u])))
  const userName = (id: string | null | undefined) => (id ? (usersById.value[id]?.displayName ?? common.ws.removedUser) : '—')

  /** L'utente corrente può vedere il progetto (admin, progetto pubblico, o utente scelto di un progetto limitato). */
  function canSee(p: Project) {
    const me = currentUser.value?.id
    return isAdmin.value || projectVisibility(p) === 'public' || (me !== undefined && p.members.includes(me))
  }
  /** Un utente qualsiasi (non solo quello corrente) vede il progetto? */
  function canUserSee(u: Pick<User, 'id' | 'role'>, p: Project) {
    return meta.value?.mode === 'local' || u.role === 'admin' || projectVisibility(p) === 'public' || p.members.includes(u.id)
  }
  const accessibleProjects = computed(() => Object.values(projects.value).filter(canSee))
  /** Progetti attivi (non nel cestino), in ordine alfabetico. */
  const visibleProjects = computed(() =>
    accessibleProjects.value.filter((p) => !p.trashedAt).sort((a, b) => compareText(a.name, b.name)),
  )
  /** Progetti nel cestino del workspace, i più recenti prima. */
  const trashedProjects = computed(() =>
    accessibleProjects.value.filter((p) => !!p.trashedAt).sort((a, b) => b.trashedAt!.localeCompare(a.trashedAt!)),
  )
  /** Ultimi 3 progetti modificati. */
  const recentProjects = computed(() =>
    [...visibleProjects.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3),
  )
  const favoriteIds = computed(() => (meta.value ? session.favoritesOf(meta.value.id) : []))
  const favoriteProjects = computed(() => visibleProjects.value.filter((p) => favoriteIds.value.includes(p.id)))
  const isFavorite = (projectId: string) => favoriteIds.value.includes(projectId)
  async function toggleFavorite(projectId: string) {
    if (meta.value) await session.toggleFavorite(meta.value.id, projectId)
  }

  const foldersByParent = computed(() => {
    const map: Record<string, Folder[]> = {}
    for (const f of tree.value.folders) {
      const k = f.parentId ?? 'root'
      ;(map[k] ??= []).push(f)
    }
    for (const k in map) map[k]!.sort((a, b) => a.order - b.order || compareText(a.name, b.name))
    return map
  })

  const labelsById = computed(() => Object.fromEntries(tree.value.labels.map((l) => [l.id, l])))

  // --- apertura / chiusura ------------------------------------------------------
  /** Storage del workspace; i lock che crea dicono agli altri PC chi sta salvando. */
  async function openStorage(path: string) {
    const s = await new WorkspaceStorage(path).init()
    s.lockOwner = `${session.identity.username}@${session.identity.hostname}`
    return s
  }

  /**
   * `password`: da provare prima di quella ricordata (subito dopo la creazione
   * di un workspace di rete, quando l'utente ha scelto di non ricordarla).
   */
  async function open(path: string, opts: { password?: string } = {}): Promise<OpenResult> {
    await close()
    status.value = 'opening'
    try {
      const s = await openStorage(path)
      let isWs = await WorkspaceStorage.isWorkspace(path)
      // Cartella che non risponde: prima la VPN dell'ufficio, se scelta su questo PC
      if (!isWs && (await useVpnStore().autoConnectForPath(path).catch(() => false))) isWs = await WorkspaceStorage.isWorkspace(path)
      if (!isWs) {
        // Cartella non raggiungibile (fuori ufficio, VPN spenta): si apre la copia di questo PC, se c'è
        const cached = session.config.offlineCopy ? await findOffline(path) : null
        if (cached && !(await reachable(path))) return await openFromCache(s, cached, opts.password)
        status.value = 'closed'
        return { ok: false, error: common.ws.notAWorkspace }
      }
      storage.value = s
      meta.value = await s.readMeta()

      if (meta.value.mode === 'network' && meta.value.auth) {
        const candidate = opts.password ?? (await recallPassword(meta.value.id, session.localSecret))
        if (!candidate || !(await verifyPassword(candidate, meta.value.auth)) || !(await applyKey(candidate))) {
          status.value = 'locked'
          return { ok: false, needsPassword: true }
        }
      } else if (!(await applyKey(null))) {
        throw new Error(common.ws.keyLost)
      }
      await finishOpen()
      return { ok: true }
    } catch (e) {
      status.value = 'closed'
      storage.value = null
      return { ok: false, error: describe(e) }
    }
  }

  /** Secondo passo dell'apertura di un workspace di rete. */
  async function unlock(password: string, remember = true): Promise<OpenResult> {
    if (!storage.value || !meta.value?.auth) return { ok: false, error: common.ws.nothingToUnlock }
    if (!(await verifyPassword(password, meta.value.auth))) return { ok: false, error: common.ws.wrongPassword }
    if (!(await applyKey(password))) return { ok: false, error: common.ws.keyLost }
    // Ricordata solo se l'utente lo sceglie; altrimenti si toglie anche una
    // eventuale copia vecchia (non più valida, visto che è stata richiesta).
    if (remember) await rememberPassword(meta.value.id, password, session.localSecret)
    else await forgetPassword(meta.value.id)
    try {
      if (fromCache) await finishOpenOffline(fromCache)
      else await finishOpen()
    } catch (e) {
      const error = describe(e)
      await close()
      return { ok: false, error }
    }
    return { ok: true }
  }

  // --- fuori ufficio: copia su questo PC ------------------------------------------------

  const offlineAllowed = computed(() => isNetwork.value && session.config.offlineCopy)
  const offlinePending = computed(() => Object.keys(offlineBase.value).length)
  /** La cartella risponde? (non esiste o non si raggiunge = no) */
  const reachable = async (path: string) => WorkspaceStorage.isWorkspace(path).catch(() => false)
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

  async function openFromCache(s: WorkspaceStorage, f: OfflineFile, password?: string): Promise<OpenResult> {
    storage.value = s
    meta.value = f.meta
    fromCache = f
    if (f.meta.mode === 'network' && f.meta.auth) {
      const candidate = password ?? (await recallPassword(f.meta.id, session.localSecret))
      if (!candidate || !(await verifyPassword(candidate, f.meta.auth)) || !(await applyKey(candidate))) {
        status.value = 'locked'
        return { ok: false, needsPassword: true }
      }
    } else if (!(await applyKey(null))) throw new Error(common.ws.keyLost)
    await finishOpenOffline(f)
    return { ok: true }
  }

  async function finishOpenOffline(f: OfflineFile) {
    const data = await readOffline(f, cipher)
    if (!data) throw new Error(common.ws.offlineUnreadable)
    users.value = data.users
    if (!currentUser.value) throw new Error(common.ws.offlineUnreadable)
    storage.value?.setWriter(currentUser.value.id, session.identity.hostname)
    passwordRemembered.value = !!meta.value?.auth && (await hasRememberedPassword(meta.value.id))
    tree.value = data.tree
    projects.value = data.projects
    offlineBase.value = data.base
    pendingAudit = data.pendingAudit
    audit.value = []
    readiness.value = {}
    presence.value = {}
    backups.value = []
    signature = {}
    status.value = 'unreachable'
    lastError.value = null
    notifications.load(meta.value!.id, currentUser.value.id)
    ui.toast(common.ws.openedOffline, 'warning', undefined, 8000)
    startWatching()
  }

  // Copia su questo PC: dopo ogni cambiamento, con un attimo di ritardo (più modifiche, una scrittura)
  let cacheTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleCache() {
    if (!offlineAllowed.value || !storage.value || !meta.value) return
    if (cacheTimer) clearTimeout(cacheTimer)
    cacheTimer = setTimeout(() => void flushCache(), 1500)
  }
  async function flushCache() {
    if (cacheTimer) clearTimeout(cacheTimer)
    cacheTimer = null
    const s = storage.value
    if (!offlineAllowed.value || !s || !meta.value || !currentUser.value || (status.value !== 'open' && status.value !== 'unreachable')) return
    await saveOffline(s.root, meta.value, { savedAt: nowIso(), users: users.value, tree: tree.value, projects: projects.value, base: offlineBase.value, pendingAudit }, cipher).catch(() => {})
  }

  /** Modifica di un progetto senza la cartella condivisa: sulla copia di questo PC, da inviare al ritorno. */
  function mutateOffline(id: string, fn: (p: Project) => void | boolean): Project | undefined {
    if (!offlineAllowed.value) {
      ui.toast(common.ws.offlineUnavailable, 'warning', undefined, 6000)
      return undefined
    }
    const cur = projects.value[id]
    if (!cur) return undefined
    const next = clone(cur)
    if (fn(next) === false) return cur
    if (!offlineBase.value[id]) offlineBase.value = { ...offlineBase.value, [id]: clone(cur) }
    next.updatedAt = nowIso()
    next.updatedBy = currentUser.value?.id ?? 'unknown'
    projects.value[id] = next
    useOutboxStore().onLocalChange(cur, next)
    void flushCache() // subito: il portatile può spegnersi da un momento all'altro
    return next
  }

  /**
   * Di nuovo in ufficio: le modifiche fatte fuori si uniscono, progetto per
   * progetto, a quelle dei colleghi (sotto lock, rileggendo il file). Se la
   * cartella cade a metà, ciò che non è stato inviato resta da inviare.
   */
  async function syncOffline(s: WorkspaceStorage): Promise<number> {
    const me = currentUser.value?.id ?? 'unknown'
    const reports: OfflineSyncReport[] = []
    let sent = 0
    for (const [id, base] of Object.entries(offlineBase.value)) {
      const local = projects.value[id]
      const name = local?.name ?? base.name
      try {
        if (!local) throw new Error('missing')
        if (!(await s.listProjectIds()).includes(id)) {
          reports.push({ project: name, report: { applied: 0, conflicts: [], dropped: local.items.filter((i) => JSON.stringify(i) !== JSON.stringify(base.items.find((b) => b.id === i.id))).map((i) => firstLine(i.title)) } })
        } else {
          let rep: MergeReport | null = null
          const fresh = await s.mutateProject(id, me, (remote) => {
            const r = mergeProject(base, local, remote)
            rep = r.report
            if (!r.report.applied) return false
            const target = remote as unknown as Record<string, unknown>
            for (const [k, v] of Object.entries(r.merged)) if (k !== 'version') target[k] = v
          })
          projects.value[id] = fresh
          markLocalWrite(`projects/${id}`)
          const report = rep as MergeReport | null
          if (report) {
            sent += report.applied
            if (report.conflicts.length || report.dropped.length) reports.push({ project: name, report })
          }
        }
        const rest = { ...offlineBase.value }
        delete rest[id]
        offlineBase.value = rest
      } catch (e) {
        if (!(await reachable(s.root))) {
          status.value = 'unreachable'
          lastError.value = describe(e)
          await flushCache()
          return -1
        }
        // Errore su un solo progetto: si tiene da inviare e si va avanti
        lastError.value = describe(e)
      }
    }
    if (pendingAudit.length) {
      try {
        await s.appendAudit(pendingAudit)
        audit.value = [...audit.value, ...pendingAudit].slice(-5000)
        writeGen++
        pendingAudit = []
      } catch {
        /* si riprova al prossimo invio */
      }
    }
    await flushCache()
    if (sent) ui.toast(common.ws.offlineSent(sent), 'success', undefined, 6000)
    if (reports.length) offlineReport.value = reports
    return sent
  }

  /** Spegnendo la funzione si tolgono le copie da questo PC (ma non le modifiche da inviare). */
  async function setOfflineCopy(on: boolean) {
    session.config.offlineCopy = on
    await session.saveConfig()
    if (on) await flushCache()
    else if (meta.value && !offlinePending.value) await removeOffline(meta.value.id).catch(() => {})
  }

  /**
   * Prepara la chiave dati per la cifratura sul disco: se il workspace è
   * cifrato la apre con la password (false se non ci riesce), altrimenti
   * niente. Ricorda la password della sessione.
   */
  async function applyKey(password: string | null): Promise<boolean> {
    const s = storage.value
    const info = meta.value?.encryption ?? null
    if (password) sessionPassword = password
    if (!s) return false
    if (!info) {
      cipher = null
      s.setCipher(null, false)
      return true
    }
    const c = password ? await unwrapKey(info, password) : null
    if (!c) return false
    cipher = c
    s.setCipher(c, info.enabled)
    return true
  }

  async function finishOpen() {
    const s = storage.value!
    users.value = (await s.readUsers()).users
    await ensureCurrentUser()
    passwordRemembered.value = meta.value?.mode === 'network' && !!meta.value.auth && (await hasRememberedPassword(meta.value.id))
    tree.value = await s.readTree()
    drive.value = await s.readDrive()
    audit.value = (await s.readAudit()).entries
    readiness.value = meta.value?.mode === 'network' ? await s.readAllReadiness().catch(() => ({})) : {}
    presence.value = meta.value?.mode === 'network' ? await s.readAllPresence().catch(() => ({})) : {}
    backups.value = await s.listBackups(await s.backupDir(meta.value!)).catch(() => [])
    backupError.value = null
    const ids = await s.listProjectIds()
    const loaded = await Promise.all(ids.map((id) => s.readProject(id).catch(() => null)))
    projects.value = Object.fromEntries(loaded.filter((p): p is Project => !!p).map((p) => [p.id, p]))
    signature = await s.signature()
    status.value = 'open'
    lastError.value = null
    notifications.load(meta.value!.id, currentUser.value?.id ?? 'anon')
    // Cosa è successo mentre si era offline: dalla cronologia condivisa
    notifications.ingestAudit(audit.value, currentUser.value?.id ?? null, (pid) => {
      const p = projects.value[pid]
      return !!p && canSee(p)
    })
    // Workspace creati prima della 0.2.4: la cartella dei progetti non era salvata,
    // la si ricava da quelle dei progetti (e, per l'admin, la si memorizza)
    if (!meta.value!.projectsPath && isAdmin.value && inferredProjectsPath.value) await setProjectsPath(inferredProjectsPath.value)
    await session.touchRecent({ id: meta.value!.id, name: meta.value!.name, path: s.root, projectsPath: projectsRoot.value, mode: meta.value!.mode })
    // Modifiche fatte fuori ufficio e non ancora inviate (l'app era stata chiusa senza rete): si inviano ora
    if (offlineAllowed.value) {
      const f = await findOffline(s.root).catch(() => null)
      const data = f && f.meta.id === meta.value!.id ? await readOffline(f, cipher) : null
      if (data && (Object.keys(data.base).length || data.pendingAudit.length)) {
        offlineBase.value = data.base
        pendingAudit = data.pendingAudit
        for (const id of Object.keys(data.base)) if (data.projects[id]) projects.value[id] = data.projects[id]
        await syncOffline(s)
      }
    }
    scheduleCache()
    startWatching()
  }

  /** Nuovo utente per l'identità di questo PC (con l'account di dominio, se c'è). */
  function newUserForIdentity(role: Role): User {
    const id = session.identity
    return {
      id: newId('usr'),
      username: id.username,
      hostname: id.hostname,
      displayName: id.username,
      role,
      createdAt: nowIso(),
      sid: id.sid ?? '',
      domain: id.domain ?? '',
      email: '',
      mailOn: [],
    }
  }

  async function ensureCurrentUser() {
    if (!currentUser.value) {
      const u = newUserForIdentity(users.value.length === 0 ? 'admin' : 'member')
      users.value = (await storage.value!.mutateUsers((f) => f.users.push(u))).users
    }
    await syncDomainAccount()
    // Da qui le scritture finiscono nel giornale di questo PC e la cronologia nei suoi file
    if (currentUser.value) storage.value?.setWriter(currentUser.value.id, session.identity.hostname)
  }

  /**
   * Accesso con l'account di dominio: il proprio utente prende il SID
   * dell'account (se nessun altro l'ha già) e, se l'amministratore ha indicato
   * dei gruppi, il ruolo che i gruppi di Active Directory gli danno. Si cambia
   * solo il proprio utente; l'ultimo amministratore non perde mai il ruolo.
   */
  async function syncDomainAccount() {
    const s = storage.value
    const me = currentUser.value
    const dl = meta.value?.domainLogin
    const id = session.identity
    if (!s || !me || !dl?.enabled || !id.sid) return
    const patch: Partial<User> = {}
    if (me.sid !== id.sid && !users.value.some((u) => u.id !== me.id && u.sid === id.sid)) Object.assign(patch, { sid: id.sid, domain: id.domain ?? '' })
    const role = roleFromGroups(dl, id.groups ?? [])
    const admins = users.value.filter((u) => u.role === 'admin')
    if (role && role !== me.role && !(me.role === 'admin' && admins.length <= 1)) patch.role = role
    if (!Object.keys(patch).length) return
    try {
      users.value = (await s.mutateUsers((f) => {
        const u = f.users.find((x) => x.id === me.id)
        if (u) Object.assign(u, patch)
      })).users
    } catch (e) {
      lastError.value = describe(e)
    }
  }

  async function close() {
    // Chi chiude non lavora più a nulla: lo si dice agli altri (se la cartella risponde)
    if (myPresence.value?.itemId) await setWorkingOn(null).catch(() => {})
    await flushCache()
    stopWatching()
    fromCache = null
    offlineBase.value = {}
    pendingAudit = []
    storage.value = null
    sessionPassword = null
    cipher = null
    meta.value = null
    passwordRemembered.value = false
    users.value = []
    tree.value = { folders: [], labels: [] }
    drive.value = { schema: 1, rootFolderId: null, rootName: '', syncedAt: null, syncedBy: null, nodes: [], oauthClientId: '', oauthClientSecret: '' }
    audit.value = []
    readiness.value = {}
    presence.value = {}
    backups.value = []
    backupError.value = null
    notifications.clearSession()
    projects.value = {}
    signature = {}
    status.value = 'closed'
    ui.selectedItemId = null
  }

  /** `path`: cartella Dati Todo Doto; `projectsPath`: cartella dei progetti (deve essere diversa). */
  async function create(opts: { path: string; projectsPath?: string; name: string; mode: WorkspaceMode; password?: string; rememberPassword?: boolean }): Promise<OpenResult> {
    try {
      const s = await openStorage(opts.path)
      if (await WorkspaceStorage.isWorkspace(opts.path)) {
        return { ok: false, error: common.ws.alreadyExists }
      }
      const admin = newUserForIdentity('admin')
      const m: WorkspaceMeta = {
        schema: 1,
        id: newId('ws'),
        name: opts.name.trim(),
        mode: opts.mode,
        createdBy: admin.id,
        createdAt: nowIso(),
        auth: opts.mode === 'network' && opts.password ? await hashPassword(opts.password) : null,
        projectsPath: opts.projectsPath?.trim() ?? '',
        backup: { enabled: true, dir: '' },
        encryption: null,
        domainLogin: { enabled: false, adminGroups: [], cleanerGroups: [] },
        mail: structuredClone(MAIL_DEFAULTS),
      }
      await s.create(m, { users: [admin] })
      if (m.auth && opts.password && opts.rememberPassword !== false) await rememberPassword(m.id, opts.password, session.localSecret)
      return open(opts.path, { password: opts.password })
    } catch (e) {
      return { ok: false, error: describe(e) }
    }
  }

  // --- aggiornamento live --------------------------------------------------------
  function startWatching() {
    stopWatching()
    // Controllo adattivo: spesso con la finestra davanti, meno in secondo piano o lontani dal PC
    const chain = ++pollChain
    const schedule = () => {
      const delay = pollInterval({
        hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
        focused: typeof document === 'undefined' || document.hasFocus(),
        idleMs: Date.now() - lastActivity,
      })
      pollTimer = window.setTimeout(() => void refresh().finally(() => chain === pollChain && schedule()), delay)
    }
    lastActivity = Date.now()
    schedule()
    window.addEventListener('pointerdown', onActivity, true)
    window.addEventListener('keydown', onActivity, true)
    // Copia automatica: poco dopo l'apertura, poi un controllo ogni ora (si fa solo se dovuta)
    backupTimer = window.setTimeout(function tick() {
      void maybeAutoBackup()
      backupTimer = window.setTimeout(tick, BACKUP_CHECK_MS)
    }, BACKUP_FIRST_MS)
    void storage.value?.watch(() => void refresh()).then((u) => (unwatch = u))
    window.addEventListener('focus', onFocus)
    presenceTimer = window.setInterval(() => {
      presenceNow.value = Date.now()
      const mine = myPresence.value
      if (mine?.itemId && Date.now() - Date.parse(mine.beat) >= PRESENCE_BEAT_MS) void writeMyPresence({ ...mine, beat: nowIso() })
    }, 60_000)
  }
  function stopWatching() {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    pollChain++
    window.removeEventListener('pointerdown', onActivity, true)
    window.removeEventListener('keydown', onActivity, true)
    if (backupTimer) clearTimeout(backupTimer)
    backupTimer = null
    if (presenceTimer) clearInterval(presenceTimer)
    presenceTimer = null
    unwatch?.()
    unwatch = null
    window.removeEventListener('focus', onFocus)
  }
  const onFocus = () => void refresh()

  /**
   * Confronta la firma dei file e ricarica solo ciò che è cambiato.
   * Le chiamate concorrenti vengono accodate (non perse): se arriva una
   * notifica mentre un refresh è in corso, se ne esegue un altro subito dopo.
   */
  function refresh(): Promise<void> {
    if (refreshing) {
      refreshQueued = true
      return refreshing
    }
    refreshing = (async () => {
      do {
        refreshQueued = false
        await refreshOnce()
      } while (refreshQueued)
    })().finally(() => (refreshing = null))
    return refreshing
  }

  async function refreshOnce() {
    const s = storage.value
    // Solo a workspace aperto (non durante l'apertura: la chiave dati potrebbe non essere ancora pronta)
    if (!s || (status.value !== 'open' && status.value !== 'unreachable')) return
    try {
      // Le scritture locali successive a questa lettura rendono superata la firma:
      // un file appena creato qui sembrerebbe "cancellato" (vedi stale() sotto).
      const gen = writeGen
      const next = await s.signature()
      const changedKeys = new Set<string>()
      for (const k of new Set([...Object.keys(signature), ...Object.keys(next)])) {
        if (signature[k] !== next[k]) changedKeys.add(k)
      }
      if (status.value === 'unreachable') {
        status.value = 'open'
        fromCache = null
        // Prima si inviano le modifiche fatte fuori ufficio, poi si leggono quelle degli altri
        if (offlinePending.value || pendingAudit.length) {
          const sent = await syncOffline(s)
          if (sent === 0) ui.toast(common.ws.reachableAgain, 'success')
          refreshQueued = true
          return
        }
        ui.toast(common.ws.reachableAgain, 'success')
      }
      // La cartella è raggiungibile e lo stato è allineato: da qui in poi le
      // notifiche arrivano dal diff dei progetti, non dalla cronologia.
      notifications.touchSeen()
      if (changedKeys.size === 0) return

      const me = currentUser.value?.id
      const remoteAuthors = new Set<string>()
      const applied: Record<string, string | undefined> = {}
      const auditKeys: string[] = []
      /** Progetti già riletti in questo giro (true se applicati). */
      const projectDone = new Map<string, boolean>()
      for (const key of changedKeys) {
        // Se dalla lettura della firma è avvenuta una scrittura locale, si salta: il
        // file verrà riletto al prossimo giro (la sua firma resta "da aggiornare").
        const stale = () => gen !== writeGen
        if (key === 'workspace.json') {
          const v = await s.readMeta()
          if (stale()) continue
          const before = meta.value?.encryption ?? null
          const domainBefore = JSON.stringify(meta.value?.domainLogin ?? null)
          meta.value = v
          if (JSON.stringify(v.domainLogin) !== domainBefore) void syncDomainAccount()
          // Cifratura attivata, disattivata o chiave riavvolta da un amministratore
          if (JSON.stringify(before) !== JSON.stringify(v.encryption)) {
            const ok = v.encryption && cipher ? (s.setCipher(cipher, v.encryption.enabled), true) : await applyKey(sessionPassword)
            if (!ok) {
              if (storage.value === s) await lockOut()
              return
            }
          }
        } else if (key === 'users.json') {
          const v = (await s.readUsers()).users
          if (stale()) continue
          users.value = v
        } else if (key === 'tree.json') {
          const v = await s.readTree()
          if (stale()) continue
          tree.value = v
        } else if (key === 'drive.json') {
          const v = await s.readDrive()
          if (stale()) continue
          drive.value = v
        } else if (key.startsWith('readiness/')) {
          const id = key.slice('readiness/'.length)
          const v = next[key] ? await s.readReadiness(id).catch(() => null) : null
          if (stale()) continue
          const copy = { ...readiness.value }
          if (v) copy[id] = v
          else delete copy[id]
          readiness.value = copy
        } else if (key.startsWith('presence/')) {
          const id = key.slice('presence/'.length)
          const v = next[key] ? await s.readPresence(id).catch(() => null) : null
          if (stale()) continue
          const copy = { ...presence.value }
          if (v) copy[id] = v
          else delete copy[id]
          presence.value = copy
        } else if (key === 'audit.json' || key.startsWith('audit/')) {
          // Cronologia: si rilegge una volta sola, dopo, solo nei file cambiati
          auditKeys.push(key)
          continue
        } else if (key.startsWith('projects/')) {
          // Progetto grande: i capitoli (projects/<id>.c<n>) fanno parte dello stesso progetto
          const id = key.slice('projects/'.length).replace(/\.c\d+$/, '')
          const done = projectDone.get(id)
          if (done !== undefined) {
            if (done) applied[key] = next[key]
            continue
          }
          projectDone.set(id, false)
          if (!next[`projects/${id}`]) {
            if (stale()) continue
            delete projects.value[id]
            if (ui.selectedItemId && !findItem(ui.selectedItemId)) ui.selectedItemId = null
            projectDone.set(id, true)
            continue
          }
          const fresh = await s.readProject(id).catch(() => null)
          if (!fresh || stale()) continue
          const prev = projects.value[id]
          if (prev && prev.updatedBy === me && fresh.version < prev.version) continue
          if (prev && fresh.updatedBy !== me) {
            remoteAuthors.add(fresh.updatedBy)
            ui.flashItems(diffItems(prev, fresh))
            if (canSee(fresh)) notifications.ingest(fresh, diffProjects(prev, fresh), me ?? null)
          }
          projects.value[id] = fresh
          projectDone.set(id, true)
          for (const k of changedKeys) if (k !== key && k.startsWith(`projects/${id}.c`)) applied[k] = next[k]
        }
        applied[key] = next[key]
      }
      if (auditKeys.length) {
        const v = (await s.readAudit(auditKeys).catch(() => null))?.entries
        if (v && gen === writeGen) {
          audit.value = v
          for (const k of auditKeys) applied[k] = next[k]
        }
      }
      // Aggiorna la firma solo per i file effettivamente applicati
      for (const k of Object.keys(next)) if (!changedKeys.has(k)) applied[k] = next[k]
      // I file saltati tengono la firma di prima: restano "da aggiornare" al prossimo giro
      for (const k of changedKeys) if (!(k in applied)) applied[k] = signature[k]
      signature = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== undefined)) as Signature
      scheduleCache()
      if (remoteAuthors.size > 0) {
        const names = [...remoteAuthors].map(userName).join(', ')
        ui.toast(common.ws.updatedBy(names), 'info')
      }
    } catch (e) {
      // File cifrati che questa sessione non sa più leggere: si chiede di nuovo la password
      // (un errore nato mentre questa sessione attivava la cifratura, o in uno storage già chiuso, si ignora: si riprova al prossimo giro)
      if (e instanceof Error && e.message === 'encrypted') {
        if (storage.value === s && !s.hasCipher) await lockOut()
        return
      }
      if (status.value === 'open') {
        status.value = 'unreachable'
        lastError.value = describe(e)
      }
      if (status.value === 'unreachable') void tryVpn()
    }
  }

  /** Cartella condivisa non raggiungibile: si prova a collegare la VPN scelta (al massimo ogni 2 minuti). */
  async function tryVpn() {
    if (!isNetwork.value || !meta.value) return
    if (await useVpnStore().autoConnect(meta.value.id).catch(() => false)) void refresh()
  }

  /** La chiave dati non è più valida (password cambiata altrove): si chiude e si chiede di riaprire. */
  async function lockOut() {
    await close()
    ui.toast(common.ws.keyLost, 'warning', undefined, 10000)
    const { router } = await import('@/router')
    await router.replace({ name: 'welcome' })
  }

  /**
   * Cifratura dei dati sul disco (solo amministratori, workspace di rete):
   * attivandola si crea la chiave dati (o si riusa quella di prima), la si
   * salva avvolta dalla password in workspace.json e si riscrivono cifrati
   * tutti i file; disattivandola si riscrivono in chiaro (la chiave resta, per
   * le copie di sicurezza cifrate). Gli altri PC aperti se ne accorgono da soli.
   */
  async function setEncryption(enabled: boolean): Promise<boolean> {
    const s = storage.value
    if (!s || !meta.value || !isAdmin.value) return false
    if (!isNetwork.value || !meta.value.auth || !sessionPassword) {
      ui.toast(common.ws.encryptOnlyNetwork, 'warning', undefined, 6000)
      return false
    }
    const password = sessionPassword
    const r = await guard(async () => {
      let info = meta.value!.encryption
      let c = cipher
      if (!info || !c) {
        const created = await createEncryption(password)
        info = created.info
        c = created.cipher
      }
      const next = { ...info, enabled }
      // Prima la chiave (così chi legge sa decifrare), poi i file nel nuovo formato
      meta.value = await s.mutateMeta((x) => void (x.encryption = next))
      cipher = c
      s.setCipher(c, enabled)
      writeGen++
      await s.rewriteAll()
      // Anche le copie di sicurezza che si faranno da ora
      signature = await s.signature()
      return true
    })
    return !!r
  }

  function diffItems(a: Project, b: Project): string[] {
    const prev = new Map(a.items.map((i) => [i.id, JSON.stringify(i)]))
    return b.items.filter((i) => prev.get(i.id) !== JSON.stringify(i)).map((i) => i.id)
  }

  // --- mutazioni: helper -------------------------------------------------------------
  /** Errori leggibili: i codici del sistema (rete, permessi…) diventano spiegazioni. */
  function describe(e: unknown) {
    return explainFsError(e, storage.value?.root ?? '')
  }

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const r = await fn()
      lastError.value = null
      return r
    } catch (e) {
      lastError.value = describe(e)
      if (status.value === 'unreachable') ui.toast(common.ws.offlineUnavailable, 'warning', undefined, 6000)
      else ui.toast(common.ws.saveFailed(lastError.value), 'error', undefined, 6000)
      return undefined
    }
  }

  /** Registra un'operazione nella cronologia del workspace (best effort). */
  async function record(action: AuditAction, project: Pick<Project, 'id' | 'name'>, item?: Pick<Item, 'id' | 'title'> | null, count: number | null = null) {
    const s = storage.value
    if (!s) return
    const entry: AuditEntry = {
      id: newId('aud'),
      at: nowIso(),
      userId: currentUser.value?.id ?? 'unknown',
      action,
      projectId: project.id,
      projectName: project.name,
      itemId: item?.id ?? null,
      itemTitle: item ? firstLine(item.title) : null,
      count,
    }
    if (status.value === 'unreachable') {
      if (offlineAllowed.value) pendingAudit.push(entry)
      return
    }
    try {
      await s.appendAudit([entry])
      audit.value = [...audit.value, entry].slice(-5000)
      writeGen++
    } catch (e) {
      lastError.value = describe(e)
    }
  }

  async function mutateProject(id: string, fn: (p: Project) => void | boolean) {
    const s = storage.value
    const me = currentUser.value?.id ?? 'unknown'
    if (!s) return
    if (status.value === 'unreachable') return mutateOffline(id, fn)
    try {
      // Il progetto appena riletto, prima della modifica: per sapere cosa ha fatto questo utente (Teams, email)
      let before: Project | null = null
      const fresh = await s.mutateProject(id, me, (p) => {
        before = clone(p)
        return fn(p)
      })
      if (before && fresh) useOutboxStore().onLocalChange(before, fresh)
      projects.value[id] = fresh
      markLocalWrite(`projects/${id}`) // forza il ricalcolo alla prossima firma senza segnalare "remoto"
      lastError.value = null
      scheduleCache()
      return fresh
    } catch (e) {
      lastError.value = describe(e)
      // La cartella è appena caduta (VPN, Wi-Fi): si continua sulla copia di questo PC
      if (offlineAllowed.value && storage.value === s && !(await reachable(s.root))) {
        status.value = 'unreachable'
        return mutateOffline(id, fn)
      }
      ui.toast(common.ws.saveFailed(lastError.value), 'error', undefined, 6000)
      return undefined
    }
  }

  /** Pubblica l'esito delle verifiche di questo PC (solo il file dell'utente corrente). */
  async function writeMyReadiness(f: ReadinessFile) {
    const s = storage.value
    if (!s || !isNetwork.value || f.userId !== currentUser.value?.id) return
    try {
      await s.writeReadiness(f)
      readiness.value = { ...readiness.value, [f.userId]: f }
      markLocalWrite(`readiness/${f.userId}`)
    } catch (e) {
      lastError.value = describe(e) // non bloccante: si riprova alla prossima verifica
    }
  }

  // --- chi lavora a cosa ---------------------------------------------------------

  const myPresence = computed(() => (currentUser.value ? (presence.value[currentUser.value.id] ?? null) : null))

  async function writeMyPresence(f: PresenceFile) {
    const s = storage.value
    if (!s || !isNetwork.value || f.userId !== currentUser.value?.id) return false
    try {
      await s.writePresence(f)
      presence.value = { ...presence.value, [f.userId]: f }
      markLocalWrite(`presence/${f.userId}`)
      return true
    } catch (e) {
      lastError.value = describe(e) // non bloccante: si riprova al prossimo rinnovo
      return false
    }
  }

  /**
   * «Ci sto lavorando»: un solo task per volta (sceglierne un altro sposta
   * l'indicazione), null per smettere. Solo nei workspace di rete.
   */
  async function setWorkingOn(target: { projectId: string; itemId: string } | null) {
    const me = currentUser.value
    if (!me || !isNetwork.value) return false
    if (!target && !myPresence.value?.itemId) return true
    const now = nowIso()
    return writeMyPresence({
      userId: me.id,
      projectId: target?.projectId ?? null,
      itemId: target?.itemId ?? null,
      since: target ? (myPresence.value?.itemId === target.itemId ? (myPresence.value.since ?? now) : now) : null,
      beat: now,
    })
  }

  /**
   * Indicazioni valide: rinnovate di recente, su un task che esiste ancora, da
   * fare, in un progetto che l'utente corrente vede, di un utente del workspace.
   * Le altre (task completato o cestinato, app chiusa male) si ignorano: nessuna
   * indicazione «fantasma».
   */
  const workingEntries = computed<WorkingEntry[]>(() => {
    if (!isNetwork.value) return []
    const out: WorkingEntry[] = []
    for (const f of Object.values(presence.value)) {
      if (!f.itemId || !f.projectId) continue
      if (presenceNow.value - Date.parse(f.beat) > PRESENCE_STALE_MS) continue
      const user = usersById.value[f.userId]
      const project = projects.value[f.projectId]
      if (!user || !project || project.trashedAt || !canSee(project)) continue
      const item = project.items.find((i) => i.id === f.itemId)
      if (!item || item.bucket !== 'todo') continue
      out.push({ user, project, item, since: f.since ?? f.beat })
    }
    return out.sort((a, b) => compareText(a.user.displayName, b.user.displayName))
  })
  /** Chi lavora a ogni task: itemId -> utenti (compreso quello corrente). */
  const workingByItem = computed(() => {
    const map: Record<string, WorkingEntry[]> = {}
    for (const e of workingEntries.value) (map[e.item.id] ??= []).push(e)
    return map
  })
  // Il task su cui si lavorava è stato completato, cestinato o eliminato: l'indicazione si toglie da sola
  watch(
    () => {
      const mine = myPresence.value
      if (!mine?.itemId || !mine.projectId || status.value !== 'open') return null
      const item = projects.value[mine.projectId]?.items.find((i) => i.id === mine.itemId)
      return item && item.bucket === 'todo' ? null : mine.itemId
    },
    (gone) => {
      if (gone) void setWorkingOn(null)
    },
  )

  /** Sostituisce il file Drive del workspace (struttura sincronizzata). */
  async function writeDrive(d: DriveFile) {
    const s = storage.value
    if (!s) return
    return guard(async () => {
      await s.writeDrive(d)
      drive.value = d
      markLocalWrite('drive.json')
    })
  }

  async function mutateTree(fn: (t: TreeFile) => void) {
    const s = storage.value
    if (!s) return
    return guard(async () => {
      tree.value = await s.mutateTree(fn)
    })
  }

  function findItem(itemId: string): { project: Project; item: Item } | null {
    for (const p of Object.values(projects.value)) {
      const item = p.items.find((i) => i.id === itemId)
      if (item) return { project: p, item }
    }
    return null
  }

  // --- progetti ---------------------------------------------------------------------
  /** Crea un progetto (solo amministratori). */
  async function createProject(data: Pick<Project, 'name' | 'description' | 'folderId' | 'members'> & { visibility?: Visibility }) {
    const s = storage.value
    const me = currentUser.value?.id ?? 'unknown'
    if (!s || !isAdmin.value) return
    const p: Project = {
      schema: 1,
      id: newId('prj'),
      ...data,
      name: data.name.trim(),
      version: 1,
      createdAt: nowIso(),
      createdBy: me,
      updatedAt: nowIso(),
      updatedBy: me,
      trashedAt: null,
      items: [],
      attachmentFolders: [],
      attachments: [],
      milestones: [],
      stack: { ...EMPTY_STACK },
      aiTools: [],
      github: null,
      teams: null,
      nextSeq: 1,
      git: { autoClose: true, handled: [], baselineDone: false },
      visibility: data.visibility ?? (data.members.length ? 'restricted' : 'public'),
    }
    const ok = await guard(async () => {
      await s.writeProject(p)
      projects.value[p.id] = p
      markLocalWrite(`projects/${p.id}`)
      return true
    })
    if (ok) await record('project_created', p)
    return ok ? p : undefined
  }

  /**
   * Crea un progetto per ogni cartella di progetto trovata (nome = nome della
   * cartella), con lo Stack ricavato dai suoi file. Restituisce quanti ne ha creati.
   */
  async function importProjects(found: { name: string; path: string }[], onProgress?: (done: number, total: number) => void) {
    let created = 0
    const unreadable: string[] = []
    for (const [i, f] of found.entries()) {
      // Cartella già di un progetto del workspace: non lo si crea due volte
      if (projectAtPath(f.path)) {
        onProgress?.(i + 1, found.length)
        continue
      }
      const { description, stack } = await detectStack(f.path).catch((e) => {
        // Cartella non leggibile (rete, permessi): il progetto si crea comunque, lo stack si rileva poi dalla sezione Stack
        unreadable.push(`${f.name}: ${describe(e)}`)
        return { description: '', stack: { ...EMPTY_STACK, sourcePath: f.path } }
      })
      const p = await createProject({ name: f.name, description, folderId: null, members: [] })
      if (p && (await mutateProject(p.id, (x) => void (x.stack = stack)))) created++
      onProgress?.(i + 1, found.length)
    }
    if (unreadable.length) ui.toast(common.ws.stackUnreadable(unreadable.join(' · ')), 'warning', undefined, 10000)
    return created
  }

  const updateProject = (id: string, data: Partial<Pick<Project, 'name' | 'description' | 'folderId' | 'members'>>) =>
    mutateProject(id, (p) => void Object.assign(p, data))

  /**
   * Visibilità del progetto (admin): pubblica, visibile a tutti; limitata, solo
   * agli utenti scelti in Membri › Gestione permessi (e agli amministratori).
   * Gli utenti scelti restano memorizzati anche passando a pubblica.
   */
  const setProjectVisibility = (id: string, visibility: Visibility) =>
    isAdmin.value ? mutateProject(id, (p) => void (p.visibility = visibility)) : Promise.resolve(undefined)

  /** Sposta il progetto nel cestino del workspace (recuperabile). */
  async function trashProject(id: string) {
    const r = await mutateProject(id, (p) => void (p.trashedAt = nowIso()))
    if (r) await record('project_trashed', r)
    return r
  }

  /** Ripristina dal cestino; se la cartella non esiste più, il progetto torna alla radice. */
  async function restoreProject(id: string) {
    const r = await mutateProject(id, (p) => {
      p.trashedAt = null
      if (p.folderId && !tree.value.folders.some((f) => f.id === p.folderId)) p.folderId = null
    })
    if (r) await record('project_restored', r)
    return r
  }

  /** Eliminazione definitiva del file del progetto. */
  async function deleteProject(id: string) {
    const s = storage.value
    const p = projects.value[id]
    if (!s || !p) return
    if (!canPurge.value) {
      ui.toast(common.ws.onlyAdminsPurge, 'warning')
      return
    }
    const ok = await guard(async () => {
      await s.deleteProject(id)
      delete projects.value[id]
      delete signature[`projects/${id}`]
      return true
    })
    if (ok) await record('project_deleted', p)
  }

  async function emptyProjectTrash() {
    for (const p of trashedProjects.value) await deleteProject(p.id)
  }

  // --- elementi ---------------------------------------------------------------------
  async function addItem(projectId: string, data: Partial<Item> & { title: string }) {
    const me = currentUser.value?.id ?? 'unknown'
    const item: Item = {
      id: newId('itm'),
      title: data.title.trim(),
      notes: data.notes ?? '',
      priority: data.priority ?? 'media',
      status: data.status ?? 'da_valutare',
      dueDate: data.dueDate ?? null,
      confirmedAt: null,
      labelId: data.labelId ?? null,
      assigneeId: data.assigneeId ?? null,
      bucket: 'todo',
      createdAt: nowIso(),
      createdBy: me,
      completedAt: null,
      trashedAt: null,
      comments: [],
      questions: [],
      seq: 0,
      closedByCommit: null,
      blockedBy: data.blockedBy ?? [],
      milestoneId: data.milestoneId ?? null,
      estimateHours: data.estimateHours ?? null,
      checklist: data.checklist ?? [],
    }
    // Scadenza solo se Confermato; data di conferma per il Gantt
    applyStatusRules(item, item.createdAt)
    // Numero progressivo del progetto (codice TODO-<n>), assegnato sotto lock sul file aggiornato
    const r = await mutateProject(projectId, (p) => {
      normalizeSeq(p)
      item.seq = p.nextSeq++
      p.items.push(item)
    })
    if (r) await record('item_created', r, item)
    return item
  }

  /** Mutazione su un singolo elemento del progetto; `false` se non esiste. */
  const mutateItem = (projectId: string, itemId: string, fn: (it: Item, p: Project) => void | boolean) =>
    mutateProject(projectId, (p) => {
      const it = p.items.find((i) => i.id === itemId)
      if (!it) return false
      const r = fn(it, p)
      if (r === false) return false
      it.updatedAt = nowIso()
    })

  const updateItem = (projectId: string, itemId: string, data: Partial<Item>) =>
    mutateItem(projectId, itemId, (it) => {
      Object.assign(it, data)
      // Stato o scadenza cambiati: scadenza solo se Confermato (le altre modifiche non toccano i dati esistenti)
      if ('status' in data || 'dueDate' in data) applyStatusRules(it, nowIso())
    })

  /**
   * Dipendenze: i task che vanno finiti prima di questo. Si tengono solo task
   * dello stesso progetto e mai un ciclo (il controllo si ripete sul file aggiornato).
   */
  const setBlockers = (projectId: string, itemId: string, blockerIds: string[]) =>
    mutateItem(projectId, itemId, (it, p) => {
      const next: string[] = []
      for (const id of blockerIds) {
        if (next.includes(id) || !p.items.some((i) => i.id === id)) continue
        if (wouldCycle(p.items.map((i) => (i.id === it.id ? { ...i, blockedBy: next } : i)), it.id, id)) continue
        next.push(id)
      }
      if (JSON.stringify(next) === JSON.stringify(it.blockedBy)) return false
      it.blockedBy = next
    })

  async function moveItem(projectId: string, itemId: string, bucket: Bucket) {
    if (bucket === 'trash') {
      const found = projects.value[projectId]?.items.find((i) => i.id === itemId)
      if (found && !canTrashItem(found)) {
        ui.toast(common.ws.cannotTrash, 'warning', undefined, 5000)
        return
      }
    }
    let from: Bucket | null = null
    const r = await mutateItem(projectId, itemId, (it) => {
      if (it.bucket === bucket) return false
      from = it.bucket
      it.bucket = bucket
      it.completedAt = bucket === 'done' ? nowIso() : null
      it.trashedAt = bucket === 'trash' ? nowIso() : null
      if (bucket !== 'done') it.closedByCommit = null // riaperto a mano: la nota del commit non vale più
    })
    const it = r?.items.find((i) => i.id === itemId)
    if (r && it && from) {
      const action: AuditAction =
        bucket === 'done' ? 'item_completed' : bucket === 'trash' ? 'item_trashed' : from === 'trash' ? 'item_restored' : 'item_reopened'
      await record(action, r, it)
    }
    return r
  }

  async function deleteItemForever(projectId: string, itemId: string) {
    if (!canPurge.value) {
      ui.toast(common.ws.onlyAdminsPurge, 'warning')
      return
    }
    let removed: Item | undefined
    const r = await mutateProject(projectId, (p) => {
      const idx = p.items.findIndex((i) => i.id === itemId && i.bucket === 'trash')
      if (idx < 0) return false
      removed = p.items[idx]
      p.items.splice(idx, 1)
      pruneBlockers(p.items) // chi lo aspettava non lo aspetta più
    })
    if (r && removed) await record('item_deleted', r, removed)
    return r
  }

  async function emptyTrash(projectId: string) {
    if (!canPurge.value) {
      ui.toast(common.ws.onlyAdminsPurge, 'warning')
      return
    }
    let count = 0
    const r = await mutateProject(projectId, (p) => {
      const before = p.items.length
      p.items = p.items.filter((i) => i.bucket !== 'trash')
      count = before - p.items.length
      pruneBlockers(p.items)
      return count > 0
    })
    if (r && count > 0) await record('trash_emptied', r, null, count)
    return r
  }

  // --- commenti e domande -----------------------------------------------------------
  function parseMentions(text: string): string[] {
    const ids: string[] = []
    for (const u of users.value) {
      if (text.includes(`@${u.displayName}`) || text.includes(`@${u.username}`)) ids.push(u.id)
    }
    return ids
  }

  /** Campi comuni a commenti, domande e risposte scritti dall'utente corrente. */
  const authored = (text: string) => ({
    authorId: currentUser.value?.id ?? 'unknown',
    text: text.trim(),
    mentions: parseMentions(text),
    createdAt: nowIso(),
  })

  const mutateQuestion = (projectId: string, itemId: string, questionId: string, fn: (q: Question) => void) =>
    mutateItem(projectId, itemId, (it) => {
      const q = it.questions.find((x) => x.id === questionId)
      if (!q) return false
      fn(q)
    })

  const addComment = (projectId: string, itemId: string, text: string) =>
    mutateItem(projectId, itemId, (it) => void it.comments.push({ id: newId('cmt'), ...authored(text) }))

  const deleteComment = (projectId: string, itemId: string, commentId: string) =>
    mutateItem(projectId, itemId, (it) => void (it.comments = it.comments.filter((c) => c.id !== commentId)))

  const askQuestion = (projectId: string, itemId: string, text: string) =>
    mutateItem(projectId, itemId, (it) =>
      void it.questions.push({ id: newId('qst'), ...authored(text), resolved: false, resolvedAt: null, answers: [], decision: null }),
    )

  const answerQuestion = (projectId: string, itemId: string, questionId: string, text: string) =>
    mutateQuestion(projectId, itemId, questionId, (q) => void q.answers.push({ id: newId('ans'), ...authored(text) }))

  const resolveQuestion = (projectId: string, itemId: string, questionId: string, resolved = true) =>
    mutateQuestion(projectId, itemId, questionId, (q) => {
      q.resolved = resolved
      q.resolvedAt = resolved ? nowIso() : null
    })

  /**
   * Registro delle decisioni: la risposta scelta diventa la decisione (con una
   * motivazione facoltativa) e la domanda si risolve. `answerId` null la toglie.
   */
  const decideQuestion = (projectId: string, itemId: string, questionId: string, answerId: string | null, rationale = '') =>
    mutateQuestion(projectId, itemId, questionId, (q) => {
      if (!answerId) {
        q.decision = null
        return
      }
      if (!q.answers.some((a) => a.id === answerId)) return
      q.decision = { answerId, rationale: rationale.trim(), at: nowIso(), by: currentUser.value?.id ?? 'unknown' }
      if (!q.resolved) {
        q.resolved = true
        q.resolvedAt = q.decision.at
      }
    })

  const deleteQuestion = (projectId: string, itemId: string, questionId: string) =>
    mutateItem(projectId, itemId, (it) => void (it.questions = it.questions.filter((q) => q.id !== questionId)))

  // --- tappe (versioni, rilasci) ------------------------------------------------------
  const addMilestone = (projectId: string, data: Pick<Milestone, 'name' | 'dueDate' | 'notes'>) =>
    mutateProject(projectId, (p) => {
      p.milestones.push({ id: newId('mst'), name: data.name.trim(), dueDate: data.dueDate || null, notes: data.notes.trim(), closedAt: null, createdAt: nowIso() })
    })

  const updateMilestone = (projectId: string, milestoneId: string, data: Partial<Pick<Milestone, 'name' | 'dueDate' | 'notes' | 'closedAt'>>) =>
    mutateProject(projectId, (p) => {
      const ms = p.milestones.find((x) => x.id === milestoneId)
      if (!ms) return false
      Object.assign(ms, data, data.name !== undefined ? { name: data.name.trim() } : {})
    })

  /** Elimina la tappa: i suoi task restano, senza tappa. */
  const removeMilestone = (projectId: string, milestoneId: string) =>
    mutateProject(projectId, (p) => {
      p.milestones = p.milestones.filter((x) => x.id !== milestoneId)
      for (const i of p.items) if (i.milestoneId === milestoneId) i.milestoneId = null
    })

  // --- allegati ---------------------------------------------------------------------
  const addAttachment = (projectId: string, data: Pick<Attachment, 'kind' | 'name' | 'target' | 'folderId'>) =>
    mutateProject(projectId, (p) => {
      p.attachments.push({
        id: newId('att'),
        ...data,
        name: data.name.trim(),
        addedBy: currentUser.value?.id ?? 'unknown',
        addedAt: nowIso(),
      })
    })

  const updateAttachment = (projectId: string, attId: string, data: Partial<Attachment>) =>
    mutateProject(projectId, (p) => {
      const a = p.attachments.find((x) => x.id === attId)
      if (!a) return false
      Object.assign(a, data)
    })

  const removeAttachment = (projectId: string, attId: string) =>
    mutateProject(projectId, (p) => {
      p.attachments = p.attachments.filter((a) => a.id !== attId)
    })

  const addAttachmentFolder = (projectId: string, name: string) =>
    mutateProject(projectId, (p) => {
      p.attachmentFolders.push({ id: newId('afd'), name: name.trim() })
    })

  const renameAttachmentFolder = (projectId: string, folderId: string, name: string) =>
    mutateProject(projectId, (p) => {
      const f = p.attachmentFolders.find((x) => x.id === folderId)
      if (!f) return false
      f.name = name.trim()
    })

  const removeAttachmentFolder = (projectId: string, folderId: string) =>
    mutateProject(projectId, (p) => {
      p.attachmentFolders = p.attachmentFolders.filter((f) => f.id !== folderId)
      p.attachments.forEach((a) => {
        if (a.folderId === folderId) a.folderId = null
      })
    })

  // --- cartelle --------------------------------------------------------
  /** Cartelle della barra laterale: le crea, rinomina ed elimina solo un amministratore. */
  const addFolder = (name: string, parentId: string | null) =>
    !isAdmin.value ? Promise.resolve(undefined) : mutateTree((t) => {
      const siblings = t.folders.filter((f) => f.parentId === parentId)
      t.folders.push({ id: newId('fld'), name: name.trim(), parentId, order: siblings.length })
    })

  const renameFolder = (id: string, name: string) =>
    !isAdmin.value ? Promise.resolve(undefined) :
    mutateTree((t) => {
      const f = t.folders.find((x) => x.id === id)
      if (f) f.name = name.trim()
    })

  /** Id della cartella e di tutte le sue discendenti. */
  function folderSubtree(id: string): string[] {
    const out = [id]
    for (let i = 0; i < out.length; i++) for (const c of foldersByParent.value[out[i]!] ?? []) out.push(c.id)
    return out
  }

  /** Progetti attivi contenuti nella cartella o nelle sue sottocartelle. */
  const projectsInFolderTree = (id: string) => {
    const ids = new Set(folderSubtree(id))
    return visibleProjects.value.filter((p) => p.folderId !== null && ids.has(p.folderId))
  }

  /**
   * Elimina la cartella con tutte le sottocartelle; i progetti contenuti
   * finiscono nel cestino del workspace (recuperabili, alla radice).
   */
  async function deleteFolder(id: string) {
    if (!isAdmin.value || !tree.value.folders.some((f) => f.id === id)) return
    const ids = new Set(folderSubtree(id))
    for (const p of Object.values(projects.value)) {
      if (p.folderId !== null && ids.has(p.folderId)) {
        await mutateProject(p.id, (x) => {
          x.folderId = null
          x.trashedAt ??= nowIso()
        })
      }
    }
    await mutateTree((t) => void (t.folders = t.folders.filter((f) => !ids.has(f.id))))
  }

  // --- stack e strumenti AI (solo admin) -------------------------------------
  const updateStack = (projectId: string, stack: Stack) =>
    isAdmin.value ? mutateProject(projectId, (p) => void (p.stack = stack)) : Promise.resolve(undefined)

  const addAiTool = (projectId: string, data: Omit<AiTool, 'id' | 'addedBy' | 'addedAt'>) =>
    isAdmin.value
      ? mutateProject(projectId, (p) => void p.aiTools.push({ ...data, id: newId('ait'), addedBy: currentUser.value?.id ?? 'unknown', addedAt: nowIso() }))
      : Promise.resolve(undefined)

  const updateAiTool = (projectId: string, toolId: string, data: Partial<AiTool>) =>
    isAdmin.value
      ? mutateProject(projectId, (p) => {
          const t = p.aiTools.find((x) => x.id === toolId)
          if (!t) return false
          Object.assign(t, data)
        })
      : Promise.resolve(undefined)

  const removeAiTool = (projectId: string, toolId: string) =>
    isAdmin.value ? mutateProject(projectId, (p) => void (p.aiTools = p.aiTools.filter((t) => t.id !== toolId))) : Promise.resolve(undefined)

  // --- etichette --------------------------------------------------------------------
  const addLabel = (name: string, color: string) =>
    mutateTree((t) => void t.labels.push({ id: newId('lbl'), name: name.trim(), color }))

  const updateLabel = (id: string, data: Partial<Label>) =>
    mutateTree((t) => {
      const l = t.labels.find((x) => x.id === id)
      if (l) Object.assign(l, data)
    })

  async function deleteLabel(id: string) {
    await mutateTree((t) => void (t.labels = t.labels.filter((l) => l.id !== id)))
    for (const p of Object.values(projects.value)) {
      if (p.items.some((i) => i.labelId === id))
        await mutateProject(p.id, (x) => x.items.forEach((i) => void (i.labelId === id && (i.labelId = null))))
    }
  }

  // --- utenti e accesso --------------------------------------------------------------
  async function setUserRole(userId: string, role: Role) {
    const s = storage.value
    if (!s || !isAdmin.value) return
    await guard(async () => {
      users.value = (
        await s.mutateUsers((f) => {
          const u = f.users.find((x) => x.id === userId)
          if (u) u.role = role
        })
      ).users
    })
  }

  async function renameSelf(displayName: string) {
    const s = storage.value
    const me = currentUser.value
    if (!s || !me) return
    await guard(async () => {
      users.value = (
        await s.mutateUsers((f) => {
          const u = f.users.find((x) => x.id === me.id)
          if (u) u.displayName = displayName.trim() || u.username
        })
      ).users
    })
  }

  async function removeUser(userId: string) {
    const s = storage.value
    if (!s || !isAdmin.value || userId === currentUser.value?.id) return
    await guard(async () => {
      users.value = (await s.mutateUsers((f) => void (f.users = f.users.filter((u) => u.id !== userId)))).users
    })
    for (const p of Object.values(projects.value)) {
      if (p.members.includes(userId)) await mutateProject(p.id, (x) => void (x.members = x.members.filter((m) => m !== userId)))
    }
  }

  async function changePassword(newPassword: string) {
    const s = storage.value
    // La password esiste solo nei workspace di rete, e la cambia solo un admin
    if (!s || !meta.value || !isNetwork.value || !isAdmin.value) return
    await guard(async () => {
      const auth = await hashPassword(newPassword)
      // Dati cifrati: la stessa chiave dati, avvolta con la nuova password (i file non cambiano)
      const wrapped = cipher && meta.value?.encryption ? await wrapKey(cipher.raw, newPassword, meta.value.encryption.enabled) : null
      // Password SMTP: si cifra di nuovo con la nuova password del workspace
      const oldSecret = meta.value?.mail.smtp.secret ?? ''
      const smtpPw = oldSecret && sessionPassword ? await openSecret(oldSecret, sessionPassword) : null
      const resealed = smtpPw !== null ? await sealSecret(smtpPw, newPassword) : null
      const m = await s.mutateMeta((x) => {
        x.auth = auth
        if (wrapped) x.encryption = wrapped
        if (resealed) x.mail.smtp.secret = resealed
      })
      meta.value = m
      sessionPassword = newPassword
      // La copia locale si aggiorna solo se l'admin aveva scelto di ricordarla.
      if (passwordRemembered.value) await rememberPassword(m.id, newPassword, session.localSecret)
      markLocalWrite('workspace.json')
    })
  }

  async function renameWorkspace(name: string) {
    const s = storage.value
    if (!s || !meta.value || !isAdmin.value) return
    await guard(async () => {
      const m = await s.mutateMeta((x) => void (x.name = name.trim()))
      meta.value = m
      markLocalWrite('workspace.json')
      await session.touchRecent({ id: m.id, name: m.name, path: s.root, projectsPath: m.projectsPath, mode: m.mode })
    })
  }

  /** Cambia la cartella dei progetti del workspace (admin). */
  // --- commit git → task ------------------------------------------------------------

  /**
   * Applica i commit letti dalla cartella del progetto: completa i task citati
   * con "chiude TODO-n" e segna i commit come usati (una volta sola). Alla
   * prima lettura i commit esistenti si segnano come visti senza chiudere nulla.
   * Restituisce i task completati.
   */
  async function applyGitCommits(projectId: string, commits: GitCommit[]) {
    const current = projects.value[projectId]
    if (!current || current.trashedAt || !current.git.autoClose) return []
    // Controllo veloce in memoria: niente scrittura se non c'è niente di nuovo
    if (current.git.baselineDone && !planGitClose(current, commits).handled.length) return []
    const closed: { item: Item; commit: GitCommit }[] = []
    const r = await mutateProject(projectId, (p) => {
      normalizeSeq(p)
      const plan = planGitClose(p, commits)
      if (p.git.baselineDone && !plan.handled.length) return false
      for (const { item, commit } of plan.close) {
        item.bucket = 'done'
        item.completedAt = nowIso()
        item.trashedAt = null
        item.closedByCommit = { hash: commit.hash, author: commit.author, date: commit.date, subject: subjectOf(commit.message) }
        closed.push({ item, commit })
      }
      p.git = { ...p.git, baselineDone: true, handled: [...p.git.handled, ...plan.handled].slice(-MAX_HANDLED) }
    })
    if (!r) return []
    for (const { item } of closed) {
      const fresh = r.items.find((i) => i.id === item.id)
      if (fresh) await record('item_completed', r, fresh)
    }
    for (const { item, commit } of closed) ui.toast(common.git.closedToast(taskCode(item.seq), commit.hash.slice(0, 7), commit.author), 'success', undefined, 5000)
    return closed.map((c) => c.item)
  }

  /**
   * Completa un task con un commit scelto dall'utente (suggerimento confermato):
   * come "chiude TODO-n", ma deciso a mano. Il commit vale una volta sola.
   */
  async function closeItemByCommit(projectId: string, itemId: string, commit: GitCommit) {
    let done: Item | null = null
    const r = await mutateProject(projectId, (p) => {
      const item = p.items.find((i) => i.id === itemId)
      if (!item || item.bucket !== 'todo') return false
      item.bucket = 'done'
      item.completedAt = nowIso()
      item.trashedAt = null
      item.closedByCommit = { hash: commit.hash, author: commit.author, date: commit.date, subject: subjectOf(commit.message) }
      if (!p.git.handled.includes(commit.hash)) p.git = { ...p.git, handled: [...p.git.handled, commit.hash].slice(-MAX_HANDLED) }
      done = item
    })
    const fresh = r && done ? r.items.find((i) => i.id === itemId) : null
    if (r && fresh) await record('item_completed', r, fresh)
    return fresh ?? null
  }

  /** Attiva o disattiva la chiusura dei task dai commit (amministratori). */
  const setGitAutoClose = (projectId: string, on: boolean) =>
    isAdmin.value ? mutateProject(projectId, (p) => void (p.git = { ...p.git, autoClose: on })) : Promise.resolve(undefined)

  // --- copie di sicurezza ------------------------------------------------------------

  async function refreshBackups() {
    const s = storage.value
    if (!s || !meta.value) return
    try {
      backups.value = await s.listBackups(await s.backupDir(meta.value))
    } catch {
      backups.value = []
    }
  }

  async function bundle(reason: BackupReason): Promise<BackupBundle> {
    const content = await storage.value!.snapshot()
    return {
      format: 'pgm-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.value?.displayName ?? session.identity.username,
      host: session.identity.hostname,
      reason,
      ...content,
    }
  }

  /** Copia automatica: la fa il primo PC che trova l'ultima più vecchia di un giorno. */
  async function maybeAutoBackup() {
    const s = storage.value
    if (!s || !meta.value?.backup.enabled || status.value !== 'open' || backupBusy.value) return
    backupBusy.value = true
    try {
      await s.createBackup(await s.backupDir(meta.value), await bundle('auto'), true)
      backupError.value = null
    } catch (e) {
      backupError.value = describe(e)
    } finally {
      backupBusy.value = false
      await refreshBackups()
    }
  }

  /** "Crea copia ora" (amministratori). Restituisce il nome del file. */
  async function createBackupNow(reason: Extract<BackupReason, 'manual' | 'prerestore'> = 'manual') {
    const s = storage.value
    if (!s || !meta.value || !isAdmin.value) return null
    const name = await s.createBackup(await s.backupDir(meta.value), await bundle(reason), false)
    await refreshBackups()
    return name
  }

  async function setBackupSettings(b: { enabled: boolean; dir: string }) {
    const s = storage.value
    if (!s || !meta.value || !isAdmin.value) return
    await guard(async () => {
      meta.value = await s.mutateMeta((x) => void (x.backup = { enabled: b.enabled, dir: b.dir.trim() }))
      markLocalWrite('workspace.json')
    })
    await refreshBackups()
  }

  async function readBackup(name: string) {
    const s = storage.value!
    return s.readBackup(await s.backupDir(meta.value!), name)
  }

  /**
   * Ripristina da una copia: tutto il workspace, o un solo progetto. Prima si
   * crea una copia dello stato attuale ("prima del ripristino"), così anche il
   * ripristino si può annullare. I progetti ripristinati prendono una versione
   * più alta di quella attuale, così tutti i PC li adottano.
   */
  async function restoreBackup(name: string, projectId?: string) {
    const s = storage.value
    if (!s || !meta.value || !isAdmin.value) return false
    const b = await readBackup(name)
    await createBackupNow('prerestore')
    const me = currentUser.value?.id ?? 'unknown'
    const bump = (p: Project): Project => ({ ...p, version: Math.max(p.version, projects.value[p.id]?.version ?? 0) + 1, updatedAt: nowIso(), updatedBy: me })
    if (projectId) {
      const p = b.projects.find((x) => x.id === projectId)
      if (!p) return false
      await s.restoreProject(bump(p))
      await reloadFromDisk()
      await record('project_restored', p)
    } else {
      await s.restoreAll({ ...b, projects: b.projects.map(bump) }, { auth: meta.value.auth, backup: meta.value.backup, encryption: meta.value.encryption })
      await reloadFromDisk()
    }
    return true
  }

  /** Rilegge tutto dal disco (dopo un ripristino lo stato in memoria non vale più). */
  async function reloadFromDisk() {
    const s = storage.value
    if (!s) return
    writeGen++
    meta.value = await s.readMeta()
    users.value = (await s.readUsers()).users
    await ensureCurrentUser()
    tree.value = await s.readTree()
    drive.value = await s.readDrive()
    audit.value = (await s.readAudit()).entries
    readiness.value = meta.value.mode === 'network' ? await s.readAllReadiness().catch(() => ({})) : {}
    const ids = await s.listProjectIds()
    const loaded = await Promise.all(ids.map((id) => s.readProject(id).catch(() => null)))
    projects.value = Object.fromEntries(loaded.filter((p): p is Project => !!p).map((p) => [p.id, p]))
    signature = await s.signature()
    ui.selectedItemId = null
  }

  async function setProjectsPath(path: string) {
    const s = storage.value
    if (!s || !meta.value || !isAdmin.value) return
    await guard(async () => {
      const m = await s.mutateMeta((x) => void (x.projectsPath = path.trim()))
      meta.value = m
      markLocalWrite('workspace.json')
      await session.touchRecent({ id: m.id, name: m.name, path: s.root, projectsPath: m.projectsPath, mode: m.mode })
    })
  }

  /**
   * Collega il progetto a un repository GitHub e ne unisce lo Stack ricavato
   * (senza cancellare nulla). Solo amministratori. Restituisce il progetto.
   */
  const applyRepoStack = (projectId: string, link: { owner: string; repo: string }, detected: { description: string; stack: Stack }) =>
    isAdmin.value
      ? mutateProject(projectId, (p) => {
          p.github = { owner: link.owner, repo: link.repo, syncedAt: nowIso() }
          if (!p.description.trim() && detected.description) p.description = detected.description
          p.stack = mergeStack(p.stack, detected.stack).stack
        })
      : Promise.resolve(undefined)

  /** Toglie il collegamento a GitHub (lo Stack resta). */
  const unlinkGitHub = (projectId: string) => (isAdmin.value ? mutateProject(projectId, (p) => void (p.github = null)) : Promise.resolve(undefined))

  /**
   * Progetto (anche nel cestino) che ha già questa cartella sul disco, escluso
   * `exceptId`: due progetti non possono avere la stessa cartella.
   */
  const projectAtPath = (path: string, exceptId?: string) =>
    path.trim() ? (Object.values(projects.value).find((p) => p.id !== exceptId && !!p.stack.sourcePath && samePath(p.stack.sourcePath, path)) ?? null) : null

  /** Cartella del progetto sul disco (Stack › Cartella del progetto); rifiutata se è già di un altro progetto. */
  async function setProjectSourcePath(projectId: string, path: string) {
    const other = projectAtPath(path, projectId)
    if (other) {
      ui.toast(common.ws.duplicateFolder(other.name, !!other.trashedAt), 'error', undefined, 6000)
      return undefined
    }
    return mutateProject(projectId, (p) => {
      if (p.stack.sourcePath === path.trim()) return false
      p.stack = { ...p.stack, sourcePath: path.trim() }
    })
  }

  // --- email e Teams ---------------------------------------------------------------------

  /**
   * Invia un'email con il metodo del workspace (Outlook di questo PC o server
   * SMTP aziendale). 'off': nessun metodo scelto. Mai eccezioni: false se non riesce.
   */
  async function sendMail(message: MailMessage): Promise<boolean | 'off'> {
    const ms = meta.value?.mail
    if (!ms || ms.method === 'off' || !isNetwork.value) return 'off'
    try {
      if (ms.method === 'outlook') return (await mailOutlook(message)).ok
      const password = ms.smtp.secret ? (sessionPassword ? await openSecret(ms.smtp.secret, sessionPassword) : null) : ''
      if (password === null) return false
      const { host, port, security, from, user } = ms.smtp
      return (await mailSmtp({ host, port, security, from, user, password }, message)).ok
    } catch {
      return false
    }
  }

  /**
   * Email del workspace (solo amministratori, workspace di rete). `smtpPassword`:
   * undefined = invariata, '' = nessuna; si salva cifrata con la password del workspace.
   */
  async function setMailSettings(next: MailSettings, smtpPassword?: string): Promise<boolean> {
    const s = storage.value
    if (!s || !isAdmin.value || !isNetwork.value) return false
    let secret = meta.value?.mail.smtp.secret ?? ''
    if (smtpPassword !== undefined) {
      if (smtpPassword && !sessionPassword) return false
      secret = smtpPassword ? await sealSecret(smtpPassword, sessionPassword!) : ''
    }
    const value: MailSettings = { ...next, smtp: { ...next.smtp, host: next.smtp.host.trim(), from: next.smtp.from.trim(), user: next.smtp.user.trim(), secret } }
    const r = await guard(async () => {
      meta.value = await s.mutateMeta((x) => void (x.mail = value))
      markLocalWrite('workspace.json')
      return true
    })
    return !!r
  }

  /** La propria email e per cosa riceverla. */
  async function setMyMail(email: string, mailOn: MailTopic[]) {
    const s = storage.value
    const me = currentUser.value
    if (!s || !me) return
    await guard(async () => {
      users.value = (
        await s.mutateUsers((f) => {
          const u = f.users.find((x) => x.id === me.id)
          if (u) Object.assign(u, { email: email.trim(), mailOn: [...new Set(mailOn)] })
        })
      ).users
    })
  }

  /** Canale Teams di un progetto (solo amministratori); null per scollegarlo. */
  const setProjectTeams = (projectId: string, teams: Project['teams']) =>
    isAdmin.value ? mutateProject(projectId, (p) => void (p.teams = teams)) : Promise.resolve(undefined)

  /** Il riepilogo di oggi lo manda un PC solo: il primo che crea il segnaposto nella cartella Dati. */
  const claimDaily = async (key: string) => (storage.value && status.value === 'open' ? storage.value.claimDaily(key).catch(() => false) : false)

  /**
   * Accesso con l'account di dominio (solo amministratori). Per attivarlo serve
   * un account di dominio su questo PC; se si indicano gruppi degli
   * amministratori, chi lo attiva deve farne parte (altrimenti perderebbe il ruolo).
   */
  async function setDomainLogin(next: WorkspaceMeta['domainLogin']): Promise<'ok' | 'noDomain' | 'notInAdminGroup' | 'failed'> {
    const s = storage.value
    if (!s || !isAdmin.value) return 'failed'
    const id = session.identity
    const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]
    const value = { enabled: next.enabled, adminGroups: clean(next.adminGroups), cleanerGroups: clean(next.cleanerGroups) }
    if (value.enabled && !id.sid) return 'noDomain'
    if (value.enabled && value.adminGroups.length && !value.adminGroups.some((g) => inGroup(id.groups ?? [], g))) return 'notInAdminGroup'
    const r = await guard(async () => {
      meta.value = await s.mutateMeta((x) => void (x.domainLogin = value))
      markLocalWrite('workspace.json')
      await syncDomainAccount()
      return true
    })
    return r ? 'ok' : 'failed'
  }

  /** Toglie da questo PC la password ricordata: al prossimo accesso verrà richiesta. */
  async function forgetCredentials() {
    if (!meta.value) return
    await forgetPassword(meta.value.id)
    passwordRemembered.value = false
  }

  return {
    status,
    meta,
    users,
    tree,
    drive,
    writeDrive,
    projects,
    lastError,
    passwordRemembered,
    setEncryption,
    setDomainLogin,
    sendMail,
    setMailSettings,
    setMyMail,
    setProjectTeams,
    claimDaily,
    readiness,
    presence,
    offlinePending,
    offlineReport,
    offlineAllowed,
    setOfflineCopy,
    myPresence,
    setWorkingOn,
    workingEntries,
    workingByItem,
    canUserSee,
    backups,
    backupError,
    backupBusy,
    refreshBackups,
    maybeAutoBackup,
    createBackupNow,
    setBackupSettings,
    readBackup,
    restoreBackup,
    applyGitCommits,
    closeItemByCommit,
    setGitAutoClose,
    writeMyReadiness,
    currentUser,
    isAdmin,
    isNetwork,
    projectsRoot,
    canPurge,
    isCleaner,
    canTrashItem,
    audit,
    usersById,
    userName,
    visibleProjects,
    trashedProjects,
    recentProjects,
    favoriteProjects,
    isFavorite,
    toggleFavorite,
    projectsInFolderTree,
    foldersByParent,
    labelsById,
    storage,
    open,
    unlock,
    close,
    create,
    refresh,
    findItem,
    createProject,
    importProjects,
    updateProject,
    trashProject,
    restoreProject,
    deleteProject,
    emptyProjectTrash,
    addItem,
    setBlockers,
    addMilestone,
    updateMilestone,
    removeMilestone,
    updateItem,
    moveItem,
    deleteItemForever,
    emptyTrash,
    addComment,
    deleteComment,
    askQuestion,
    answerQuestion,
    resolveQuestion,
    decideQuestion,
    deleteQuestion,
    addAttachment,
    updateAttachment,
    removeAttachment,
    addAttachmentFolder,
    renameAttachmentFolder,
    removeAttachmentFolder,
    addFolder,
    renameFolder,
    deleteFolder,
    updateStack,
    addAiTool,
    updateAiTool,
    removeAiTool,
    addLabel,
    updateLabel,
    deleteLabel,
    setUserRole,
    renameSelf,
    removeUser,
    changePassword,
    renameWorkspace,
    setProjectsPath,
    setProjectSourcePath,
    projectAtPath,
    applyRepoStack,
    setProjectVisibility,
    unlinkGitHub,
    forgetCredentials,
  }
})
