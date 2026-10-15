import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { WorkspaceStorage, type Signature } from '@/services/storage'
import { hashPassword, verifyPassword } from '@/services/crypto'
import { forgetPassword, hasRememberedPassword, recallPassword, rememberPassword } from '@/services/config'
import { newId, nowIso } from '@/services/ids'
import { useSessionStore } from './session'
import { useUiStore } from './ui'
import { useNotificationsStore } from './notifications'
import { diffProjects } from '@/services/changes'
import { EMPTY_STACK, projectVisibility, type AiTool, type Stack, type Visibility } from '@/types'
import { applyStatusRules, firstLine } from '@/services/items'
import { MAX_HANDLED, normalizeSeq, planGitClose, subjectOf, taskCode, type GitCommit } from '@/services/gitLink'
import type { BackupBundle, BackupInfo, BackupReason } from '@/services/backup'
import { detectStack, inferProjectsPath, samePath } from '@/services/projectScan'
import { explainFsError } from '@/services/fsErrors'
import { mergeStack } from '@/services/stackDoc'
import type {
  Attachment,
  AuditAction,
  AuditEntry,
  Bucket,
  DriveFile,
  Folder,
  Item,
  Label,
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

export type OpenResult = { ok: true } | { ok: false; needsPassword: true } | { ok: false; error: string }
export type WsStatus = 'closed' | 'opening' | 'locked' | 'open' | 'unreachable'

const POLL_MS = 4000
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
  const drive = ref<DriveFile>({ schema: 1, rootFolderId: null, rootName: '', syncedAt: null, syncedBy: null, nodes: [] })
  const audit = ref<AuditEntry[]>([])
  /** Copie di sicurezza presenti (la più recente per prima) ed eventuale errore dell'ultima automatica. */
  const backups = ref<BackupInfo[]>([])
  const backupError = ref<string | null>(null)
  const backupBusy = ref(false)
  /** Esito delle verifiche dei prerequisiti sui PC degli utenti (solo workspace di rete). */
  const readiness = ref<Record<string, ReadinessFile>>({})
  const projects = ref<Record<string, Project>>({})
  const lastError = ref<string | null>(null)
  /** La password del workspace di rete è ricordata (cifrata) su questo PC per questo utente. */
  const passwordRemembered = ref(false)

  let signature: Signature = {}
  let pollTimer: number | null = null
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
  const currentUser = computed(
    () => users.value.find((u) => `${u.username}@${u.hostname}`.toLowerCase() === identityKey.value) ?? null,
  )
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
      if (!(await WorkspaceStorage.isWorkspace(path))) {
        status.value = 'closed'
        return { ok: false, error: common.ws.notAWorkspace }
      }
      storage.value = s
      meta.value = await s.readMeta()
      users.value = (await s.readUsers()).users

      if (meta.value.mode === 'network' && meta.value.auth) {
        const candidate = opts.password ?? (await recallPassword(meta.value.id, session.localSecret))
        if (!candidate || !(await verifyPassword(candidate, meta.value.auth))) {
          status.value = 'locked'
          return { ok: false, needsPassword: true }
        }
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
    // Ricordata solo se l'utente lo sceglie; altrimenti si toglie anche una
    // eventuale copia vecchia (non più valida, visto che è stata richiesta).
    if (remember) await rememberPassword(meta.value.id, password, session.localSecret)
    else await forgetPassword(meta.value.id)
    await finishOpen()
    return { ok: true }
  }

  async function finishOpen() {
    const s = storage.value!
    await ensureCurrentUser()
    passwordRemembered.value = meta.value?.mode === 'network' && !!meta.value.auth && (await hasRememberedPassword(meta.value.id))
    tree.value = await s.readTree()
    drive.value = await s.readDrive()
    audit.value = (await s.readAudit()).entries
    readiness.value = meta.value?.mode === 'network' ? await s.readAllReadiness().catch(() => ({})) : {}
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
    startWatching()
  }

  async function ensureCurrentUser() {
    if (currentUser.value) return
    const u: User = {
      id: newId('usr'),
      username: session.identity.username,
      hostname: session.identity.hostname,
      displayName: session.identity.username,
      role: users.value.length === 0 ? 'admin' : 'member',
      createdAt: nowIso(),
    }
    users.value = (await storage.value!.mutateUsers((f) => f.users.push(u))).users
  }

  async function close() {
    stopWatching()
    storage.value = null
    meta.value = null
    passwordRemembered.value = false
    users.value = []
    tree.value = { folders: [], labels: [] }
    drive.value = { schema: 1, rootFolderId: null, rootName: '', syncedAt: null, syncedBy: null, nodes: [] }
    audit.value = []
    readiness.value = {}
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
      const admin: User = {
        id: newId('usr'),
        username: session.identity.username,
        hostname: session.identity.hostname,
        displayName: session.identity.username,
        role: 'admin',
        createdAt: nowIso(),
      }
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
    pollTimer = window.setInterval(() => void refresh(), POLL_MS)
    // Copia automatica: poco dopo l'apertura, poi un controllo ogni ora (si fa solo se dovuta)
    backupTimer = window.setTimeout(function tick() {
      void maybeAutoBackup()
      backupTimer = window.setTimeout(tick, BACKUP_CHECK_MS)
    }, BACKUP_FIRST_MS)
    void storage.value?.watch(() => void refresh()).then((u) => (unwatch = u))
    window.addEventListener('focus', onFocus)
  }
  function stopWatching() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    if (backupTimer) clearTimeout(backupTimer)
    backupTimer = null
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
    if (!s || status.value === 'closed' || status.value === 'locked') return
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
        ui.toast(common.ws.reachableAgain, 'success')
      }
      // La cartella è raggiungibile e lo stato è allineato: da qui in poi le
      // notifiche arrivano dal diff dei progetti, non dalla cronologia.
      notifications.touchSeen()
      if (changedKeys.size === 0) return

      const me = currentUser.value?.id
      const remoteAuthors = new Set<string>()
      const applied: Record<string, string | undefined> = {}
      for (const key of changedKeys) {
        // Se dalla lettura della firma è avvenuta una scrittura locale, si salta: il
        // file verrà riletto al prossimo giro (la sua firma resta "da aggiornare").
        const stale = () => gen !== writeGen
        if (key === 'workspace.json') {
          const v = await s.readMeta()
          if (stale()) continue
          meta.value = v
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
        } else if (key === 'audit.json') {
          const v = (await s.readAudit()).entries
          if (stale()) continue
          audit.value = v
        } else if (key.startsWith('projects/')) {
          const id = key.slice('projects/'.length)
          if (!next[key]) {
            if (stale()) continue
            delete projects.value[id]
            if (ui.selectedItemId && !findItem(ui.selectedItemId)) ui.selectedItemId = null
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
        }
        applied[key] = next[key]
      }
      // Aggiorna la firma solo per i file effettivamente applicati
      for (const k of Object.keys(next)) if (!changedKeys.has(k)) applied[k] = next[k]
      // I file saltati tengono la firma di prima: restano "da aggiornare" al prossimo giro
      for (const k of changedKeys) if (!(k in applied)) applied[k] = signature[k]
      signature = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== undefined)) as Signature
      if (remoteAuthors.size > 0) {
        const names = [...remoteAuthors].map(userName).join(', ')
        ui.toast(common.ws.updatedBy(names), 'info')
      }
    } catch (e) {
      if (status.value === 'open') {
        status.value = 'unreachable'
        lastError.value = describe(e)
      }
    }
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
      ui.toast(common.ws.saveFailed(lastError.value), 'error', undefined, 6000)
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
    try {
      audit.value = (await s.appendAudit([entry])).entries
      markLocalWrite('audit.json')
    } catch (e) {
      lastError.value = describe(e)
    }
  }

  async function mutateProject(id: string, fn: (p: Project) => void | boolean) {
    const s = storage.value
    const me = currentUser.value?.id ?? 'unknown'
    if (!s) return
    return guard(async () => {
      const fresh = await s.mutateProject(id, me, fn)
      projects.value[id] = fresh
      markLocalWrite(`projects/${id}`) // forza il ricalcolo alla prossima firma senza segnalare "remoto"
      return fresh
    })
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
      stack: { ...EMPTY_STACK },
      aiTools: [],
      github: null,
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
      void it.questions.push({ id: newId('qst'), ...authored(text), resolved: false, resolvedAt: null, answers: [] }),
    )

  const answerQuestion = (projectId: string, itemId: string, questionId: string, text: string) =>
    mutateQuestion(projectId, itemId, questionId, (q) => void q.answers.push({ id: newId('ans'), ...authored(text) }))

  const resolveQuestion = (projectId: string, itemId: string, questionId: string, resolved = true) =>
    mutateQuestion(projectId, itemId, questionId, (q) => {
      q.resolved = resolved
      q.resolvedAt = resolved ? nowIso() : null
    })

  const deleteQuestion = (projectId: string, itemId: string, questionId: string) =>
    mutateItem(projectId, itemId, (it) => void (it.questions = it.questions.filter((q) => q.id !== questionId)))

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
      const m = await s.mutateMeta((x) => void (x.auth = auth))
      meta.value = m
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
      await s.restoreAll({ ...b, projects: b.projects.map(bump) }, { auth: meta.value.auth, backup: meta.value.backup })
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
    readiness,
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
    updateItem,
    moveItem,
    deleteItemForever,
    emptyTrash,
    addComment,
    deleteComment,
    askQuestion,
    answerQuestion,
    resolveQuestion,
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
