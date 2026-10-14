import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { WorkspaceStorage, type Signature } from '@/services/storage'
import { hashPassword, verifyPassword } from '@/services/crypto'
import { forgetPassword, recallPassword, rememberPassword } from '@/services/config'
import { newId, nowIso } from '@/services/ids'
import { useSessionStore } from './session'
import { useUiStore } from './ui'
import { useNotificationsStore } from './notifications'
import { diffProjects } from '@/services/changes'
import { EMPTY_STACK, type AiTool, type Stack } from '@/types'
import { firstLine } from '@/services/items'
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
  Role,
  TreeFile,
  User,
  WorkspaceMeta,
  WorkspaceMode,
} from '@/types'

export type OpenResult = { ok: true } | { ok: false; needsPassword: true } | { ok: false; error: string }
export type WsStatus = 'closed' | 'opening' | 'locked' | 'open' | 'unreachable'

const POLL_MS = 4000

export const useWorkspaceStore = defineStore('workspace', () => {
  const session = useSessionStore()
  const ui = useUiStore()
  const notifications = useNotificationsStore()

  // --- stato ----------------------------------------------------------------
  const storage = shallowRef<WorkspaceStorage | null>(null)
  const status = ref<WsStatus>('closed')
  const meta = ref<WorkspaceMeta | null>(null)
  const users = ref<User[]>([])
  const tree = ref<TreeFile>({ folders: [], categories: [], labels: [] })
  const drive = ref<DriveFile>({ schema: 1, rootFolderId: null, rootName: '', syncedAt: null, syncedBy: null, nodes: [] })
  const audit = ref<AuditEntry[]>([])
  const projects = ref<Record<string, Project>>({})
  const lastError = ref<string | null>(null)

  let signature: Signature = {}
  let pollTimer: number | null = null
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
  const userName = (id: string | null | undefined) => (id ? (usersById.value[id]?.displayName ?? 'Utente rimosso') : '—')

  /** L'utente corrente può vedere il progetto (membro, o progetto aperto a tutti, o admin). */
  function canSee(p: Project) {
    const me = currentUser.value?.id
    return isAdmin.value || p.members.length === 0 || (me !== undefined && p.members.includes(me))
  }
  const accessibleProjects = computed(() => Object.values(projects.value).filter(canSee))
  /** Progetti attivi (non nel cestino), in ordine alfabetico. */
  const visibleProjects = computed(() =>
    accessibleProjects.value.filter((p) => !p.trashedAt).sort((a, b) => a.name.localeCompare(b.name, 'it')),
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
    for (const k in map) map[k]!.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'it'))
    return map
  })

  const labelsById = computed(() => Object.fromEntries(tree.value.labels.map((l) => [l.id, l])))

  // --- apertura / chiusura ------------------------------------------------------
  async function open(path: string): Promise<OpenResult> {
    await close()
    status.value = 'opening'
    try {
      const s = await new WorkspaceStorage(path).init()
      if (!(await WorkspaceStorage.isWorkspace(path))) {
        status.value = 'closed'
        return { ok: false, error: 'La cartella scelta non contiene un workspace.' }
      }
      storage.value = s
      meta.value = await s.readMeta()
      users.value = (await s.readUsers()).users

      if (meta.value.mode === 'network' && meta.value.auth) {
        const remembered = await recallPassword(meta.value.id, session.localSecret)
        if (!remembered || !(await verifyPassword(remembered, meta.value.auth))) {
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
  async function unlock(password: string): Promise<OpenResult> {
    if (!storage.value || !meta.value?.auth) return { ok: false, error: 'Nessun workspace da sbloccare.' }
    if (!(await verifyPassword(password, meta.value.auth))) return { ok: false, error: 'Password non corretta.' }
    await rememberPassword(meta.value.id, password, session.localSecret)
    await finishOpen()
    return { ok: true }
  }

  async function finishOpen() {
    const s = storage.value!
    await ensureCurrentUser()
    tree.value = await s.readTree()
    drive.value = await s.readDrive()
    audit.value = (await s.readAudit()).entries
    const ids = await s.listProjectIds()
    const loaded = await Promise.all(ids.map((id) => s.readProject(id).catch(() => null)))
    projects.value = Object.fromEntries(loaded.filter((p): p is Project => !!p).map((p) => [p.id, p]))
    signature = await s.signature()
    status.value = 'open'
    lastError.value = null
    notifications.load(meta.value!.id, currentUser.value?.id ?? 'anon')
    await session.touchRecent({ id: meta.value!.id, name: meta.value!.name, path: s.root, mode: meta.value!.mode })
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
    users.value = []
    tree.value = { folders: [], categories: [], labels: [] }
    drive.value = { schema: 1, rootFolderId: null, rootName: '', syncedAt: null, syncedBy: null, nodes: [] }
    audit.value = []
    notifications.clearSession()
    projects.value = {}
    signature = {}
    status.value = 'closed'
    ui.selectedItemId = null
  }

  async function create(opts: { path: string; name: string; mode: WorkspaceMode; password?: string }): Promise<OpenResult> {
    try {
      const s = await new WorkspaceStorage(opts.path).init()
      if (await WorkspaceStorage.isWorkspace(opts.path)) {
        return { ok: false, error: 'In questa cartella esiste già un workspace: aprilo invece di crearne uno nuovo.' }
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
      }
      await s.create(m, { users: [admin] })
      if (m.auth && opts.password) await rememberPassword(m.id, opts.password, session.localSecret)
      return open(opts.path)
    } catch (e) {
      return { ok: false, error: describe(e) }
    }
  }

  // --- aggiornamento live --------------------------------------------------------
  function startWatching() {
    stopWatching()
    pollTimer = window.setInterval(() => void refresh(), POLL_MS)
    void storage.value?.watch(() => void refresh()).then((u) => (unwatch = u))
    window.addEventListener('focus', onFocus)
  }
  function stopWatching() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
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
      const next = await s.signature()
      const changedKeys = new Set<string>()
      for (const k of new Set([...Object.keys(signature), ...Object.keys(next)])) {
        if (signature[k] !== next[k]) changedKeys.add(k)
      }
      if (status.value === 'unreachable') {
        status.value = 'open'
        ui.toast('Cartella di nuovo raggiungibile.', 'success')
      }
      if (changedKeys.size === 0) return

      const me = currentUser.value?.id
      const remoteAuthors = new Set<string>()
      const applied: Record<string, string | undefined> = {}
      for (const key of changedKeys) {
        const gen = writeGen
        // Se durante la lettura è avvenuta una scrittura locale, si salta: il file
        // verrà riletto al prossimo giro (la sua firma resta "da aggiornare").
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
        } else if (key === 'audit.json') {
          const v = (await s.readAudit()).entries
          if (stale()) continue
          audit.value = v
        } else if (key.startsWith('projects/')) {
          const id = key.slice('projects/'.length)
          if (!next[key]) {
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
      for (const k of changedKeys) if (!(k in applied) && !next[k]) applied[k] = undefined
      signature = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== undefined)) as Signature
      if (remoteAuthors.size > 0) {
        const names = [...remoteAuthors].map(userName).join(', ')
        ui.toast(`Aggiornato da ${names}`, 'info')
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
  function describe(e: unknown) {
    return e instanceof Error ? e.message : String(e)
  }

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const r = await fn()
      lastError.value = null
      return r
    } catch (e) {
      lastError.value = describe(e)
      ui.toast(`Salvataggio non riuscito: ${lastError.value}`, 'error', undefined, 6000)
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
  async function createProject(data: Pick<Project, 'name' | 'description' | 'folderId' | 'categoryId' | 'members'>) {
    const s = storage.value
    const me = currentUser.value?.id ?? 'unknown'
    if (!s) return
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

  const updateProject = (id: string, data: Partial<Pick<Project, 'name' | 'description' | 'folderId' | 'categoryId' | 'members'>>) =>
    mutateProject(id, (p) => void Object.assign(p, data))

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
      ui.toast('Solo gli amministratori possono eliminare definitivamente.', 'warning')
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
      labelId: data.labelId ?? null,
      assigneeId: data.assigneeId ?? null,
      bucket: 'todo',
      createdAt: nowIso(),
      createdBy: me,
      completedAt: null,
      trashedAt: null,
      comments: [],
      questions: [],
    }
    const r = await mutateProject(projectId, (p) => void p.items.push(item))
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
    mutateItem(projectId, itemId, (it) => void Object.assign(it, data))

  async function moveItem(projectId: string, itemId: string, bucket: Bucket) {
    if (bucket === 'trash') {
      const found = projects.value[projectId]?.items.find((i) => i.id === itemId)
      if (found && !canTrashItem(found)) {
        ui.toast('Puoi cestinare solo gli elementi assegnati a te (o creati da te se non assegnati).', 'warning', undefined, 5000)
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
      ui.toast('Solo gli amministratori possono eliminare definitivamente.', 'warning')
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
      ui.toast('Solo gli amministratori possono eliminare definitivamente.', 'warning')
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

  // --- cartelle e categorie --------------------------------------------------------
  const addFolder = (name: string, parentId: string | null) =>
    mutateTree((t) => {
      const siblings = t.folders.filter((f) => f.parentId === parentId)
      t.folders.push({ id: newId('fld'), name: name.trim(), parentId, order: siblings.length })
    })

  const renameFolder = (id: string, name: string) =>
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
    if (!tree.value.folders.some((f) => f.id === id)) return
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
    if (!s || !meta.value || !isAdmin.value) return
    await guard(async () => {
      const m = { ...meta.value!, auth: await hashPassword(newPassword) }
      await s.writeMeta(m)
      meta.value = m
      await rememberPassword(m.id, newPassword, session.localSecret)
      markLocalWrite('workspace.json')
    })
  }

  async function renameWorkspace(name: string) {
    const s = storage.value
    if (!s || !meta.value || !isAdmin.value) return
    await guard(async () => {
      const m = { ...meta.value!, name: name.trim() }
      await s.writeMeta(m)
      meta.value = m
      await session.touchRecent({ id: m.id, name: m.name, path: s.root, mode: m.mode })
    })
  }

  async function forgetCredentials() {
    if (meta.value) await forgetPassword(meta.value.id)
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
    currentUser,
    isAdmin,
    isNetwork,
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
    forgetCredentials,
  }
})
