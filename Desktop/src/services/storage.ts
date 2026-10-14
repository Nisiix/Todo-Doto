/**
 * Lettura/scrittura di un workspace su cartella (locale o di rete).
 *
 *  <root>/workspace.json, users.json, tree.json, projects/<id>.json
 *
 * Regola d'oro: ogni modifica è una mutazione read-modify-write eseguita
 * sotto lock (`mutateProject`, `mutateTree`, …): si prende il lock del file,
 * lo si rilegge, si applica la modifica, si scrive in modo atomico (file
 * temporaneo + rename) e si rilascia il lock. Così due utenti che modificano
 * lo stesso file da PC diversi non perdono le modifiche l'uno dell'altro.
 *
 * Lock fra PC: accanto al file, `<file>.lock`, creato in modo esclusivo
 * (`createExclusive`, atomico anche su cartelle di rete) con chi lo tiene e
 * da quando. Chi lo trova occupato riprova con attese crescenti. Un lock che
 * resta identico per `staleMs` (osservato con l'orologio locale, quindi senza
 * dipendere da quello degli altri PC) o che dichiara più di `abandonedMs` di
 * età è di un salvataggio interrotto (crash, rete caduta) e viene rimosso.
 * Dentro lo stesso processo le modifiche a un file passano da una coda, una
 * alla volta. Le letture non prendono il lock: grazie al rename vedono
 * sempre un file completo.
 */
import { getFs, type FileStat, type FsApi } from './fs'
import {
  AuditFileSchema,
  DriveFileSchema,
  ProjectSchema,
  TreeFileSchema,
  UsersFileSchema,
  WorkspaceMetaSchema,
  type AuditFile,
  type DriveFile,
  type Project,
  type TreeFile,
  type UsersFile,
  type WorkspaceMeta,
} from '@/types'
import { nowIso } from './ids'
import { common } from '@/i18n/common'

export interface LockOptions {
  /** Un lock rimasto identico per questo tempo è considerato abbandonato. */
  staleMs: number
  /** Un lock che dichiara un'età maggiore (orologio di chi l'ha creato) è abbandonato. */
  abandonedMs: number
  /** Oltre questo tempo di attesa il salvataggio fallisce con `LockBusyError`. */
  timeoutMs: number
}
export const DEFAULT_LOCK: LockOptions = { staleMs: 12_000, abandonedMs: 5 * 60_000, timeoutMs: 30_000 }

/** Il file è occupato da un altro salvataggio da troppo tempo. */
export class LockBusyError extends Error {}

interface LockBody {
  token: string
  owner: string
  at: string
}
const parseLock = (raw: string): Partial<LockBody> => {
  try {
    return JSON.parse(raw) as Partial<LockBody>
  } catch {
    return {} // lock appena creato e non ancora scritto per intero
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const FILES = {
  workspace: 'workspace.json',
  users: 'users.json',
  tree: 'tree.json',
  drive: 'drive.json',
  audit: 'audit.json',
  projectsDir: 'projects',
} as const

export type Signature = Record<string, string> // path relativo -> "mtime:size"

export class WorkspaceStorage {
  private fs!: FsApi
  private paths = { workspace: '', users: '', tree: '', drive: '', audit: '', projectsDir: '' }
  /** Coda per file: le mutazioni di questo processo sullo stesso file, una alla volta. */
  private queues = new Map<string, Promise<unknown>>()
  /** Chi tiene i lock creati da questa istanza (es. "mario@PC-UFFICIO"), mostrato a chi aspetta. */
  lockOwner = ''

  constructor(
    public readonly root: string,
    private readonly lock: LockOptions = DEFAULT_LOCK,
  ) {}

  async init() {
    this.fs = await getFs()
    this.paths.workspace = await this.fs.join(this.root, FILES.workspace)
    this.paths.users = await this.fs.join(this.root, FILES.users)
    this.paths.tree = await this.fs.join(this.root, FILES.tree)
    this.paths.drive = await this.fs.join(this.root, FILES.drive)
    this.paths.audit = await this.fs.join(this.root, FILES.audit)
    this.paths.projectsDir = await this.fs.join(this.root, FILES.projectsDir)
    return this
  }

  static async isWorkspace(root: string) {
    const fs = await getFs()
    return fs.exists(await fs.join(root, FILES.workspace))
  }

  // --- helpers -------------------------------------------------------------

  private async readJson<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
    const text = await this.fs.readText(path)
    return parse(JSON.parse(text))
  }

  private writeJson(path: string, data: unknown) {
    return this.fs.writeTextAtomic(path, JSON.stringify(data, null, 2))
  }

  projectPath(id: string) {
    return this.fs.join(this.paths.projectsDir, `${id}.json`)
  }

  // --- creazione -----------------------------------------------------------

  async create(meta: WorkspaceMeta, users: UsersFile) {
    if (!(await this.fs.exists(this.root))) await this.fs.mkdir(this.root)
    await this.fs.mkdir(this.paths.projectsDir)
    await this.writeJson(this.paths.workspace, meta)
    await this.writeJson(this.paths.users, users)
    await this.writeJson(this.paths.tree, { folders: [], labels: [] } satisfies TreeFile)
  }

  // --- lock ----------------------------------------------------------------

  /** Esegue `fn` dopo le mutazioni già in coda sullo stesso file (in questo processo). */
  private serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(key) ?? Promise.resolve()).then(fn, fn)
    this.queues.set(key, run)
    const cleanup = () => {
      if (this.queues.get(key) === run) this.queues.delete(key)
    }
    run.then(cleanup, cleanup)
    return run
  }

  /** Esegue `fn` tenendo il lock del file, in coda alle altre mutazioni dello stesso file. */
  withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
    return this.serialize(path, async () => {
      const lockPath = `${path}.lock`
      const token = await this.acquire(lockPath)
      try {
        return await fn()
      } finally {
        await this.release(lockPath, token)
      }
    })
  }

  private async acquire(lockPath: string): Promise<string> {
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const body = JSON.stringify({ token, owner: this.lockOwner, at: nowIso() } satisfies LockBody)
    const start = Date.now()
    let seen: { raw: string; since: number } | null = null
    let delay = 20
    for (;;) {
      if (await this.fs.createExclusive(lockPath, body)) return token
      const raw = await this.fs.readText(lockPath).catch(() => null)
      if (raw !== null) {
        const held = parseLock(raw)
        const declaredAge = held.at ? Date.now() - Date.parse(held.at) : 0
        if (!seen || seen.raw !== raw) seen = { raw, since: Date.now() }
        if (Date.now() - seen.since >= this.lock.staleMs || declaredAge >= this.lock.abandonedMs) {
          // Lock abbandonato: lo si toglie solo se è ancora quello osservato
          // (se nel frattempo è stato rilasciato e ripreso, non è più vecchio).
          if ((await this.fs.readText(lockPath).catch(() => null)) === raw) await this.fs.remove(lockPath).catch(() => {})
          seen = null
          continue
        }
        if (Date.now() - start >= this.lock.timeoutMs) throw new LockBusyError(common.lockBusy(held.owner ?? ''))
      } else if (Date.now() - start >= this.lock.timeoutMs) throw new LockBusyError(common.lockBusy(''))
      // Attesa crescente con un po' di casualità, per non ritentare tutti insieme.
      await sleep(delay * (0.5 + Math.random()))
      delay = Math.min(delay * 2, 400)
    }
  }

  private async release(lockPath: string, token: string) {
    try {
      const raw = await this.fs.readText(lockPath)
      // Si rimuove solo il proprio lock: se è stato dichiarato abbandonato e
      // ripreso da altri (salvataggio lentissimo), resta a loro.
      if (parseLock(raw).token === token) await this.fs.remove(lockPath)
    } catch {
      /* già rimosso */
    }
  }

  // --- lettura -------------------------------------------------------------

  readMeta = () => this.readJson(this.paths.workspace, (r) => WorkspaceMetaSchema.parse(r))
  readUsers = () => this.readJson(this.paths.users, (r) => UsersFileSchema.parse(r))
  readTree = () => this.readJson(this.paths.tree, (r) => TreeFileSchema.parse(r))
  async readAudit(): Promise<AuditFile> {
    if (!(await this.fs.exists(this.paths.audit))) return { entries: [] }
    return this.readJson(this.paths.audit, (r) => AuditFileSchema.parse(r))
  }
  /** Aggiunge voci alla cronologia (sotto lock, come tutte le mutazioni). */
  appendAudit(entries: AuditFile['entries']) {
    return this.withLock(this.paths.audit, async () => {
      const a = await this.readAudit()
      a.entries.push(...entries)
      if (a.entries.length > 5000) a.entries = a.entries.slice(-5000)
      await this.writeJson(this.paths.audit, a)
      return a
    })
  }
  async readDrive(): Promise<DriveFile> {
    if (!(await this.fs.exists(this.paths.drive))) return DriveFileSchema.parse({})
    return this.readJson(this.paths.drive, (r) => DriveFileSchema.parse(r))
  }

  async readProject(id: string): Promise<Project> {
    return this.readJson(await this.projectPath(id), (r) => ProjectSchema.parse(r))
  }

  async listProjectIds(): Promise<string[]> {
    if (!(await this.fs.exists(this.paths.projectsDir))) return []
    const names = await this.fs.readDir(this.paths.projectsDir)
    return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5))
  }

  // --- scrittura -----------------------------------------------------------

  /** Sostituisce la struttura Drive sincronizzata (il contenuto è sempre l'intera struttura). */
  writeDrive = (d: DriveFile) => this.withLock(this.paths.drive, () => this.writeJson(this.paths.drive, d))

  async writeProject(p: Project) {
    await this.fs.mkdir(this.paths.projectsDir)
    await this.writeJson(await this.projectPath(p.id), p)
  }

  async deleteProject(id: string) {
    const path = await this.projectPath(id)
    await this.withLock(path, () => this.fs.remove(path))
  }

  /** Mutazione sotto lock: rilegge, applica `fn`, incrementa `version`, scrive. Ritorna il progetto aggiornato. */
  async mutateProject(id: string, actorId: string, fn: (p: Project) => void | boolean): Promise<Project> {
    const path = await this.projectPath(id)
    return this.withLock(path, async () => {
      const fresh = await this.readProject(id)
      const result = fn(fresh)
      if (result === false) return fresh
      fresh.version += 1
      fresh.updatedAt = nowIso()
      fresh.updatedBy = actorId
      await this.writeJson(path, fresh)
      return fresh
    })
  }

  mutateTree(fn: (t: TreeFile) => void) {
    return this.withLock(this.paths.tree, async () => {
      const t = await this.readTree()
      fn(t)
      await this.writeJson(this.paths.tree, t)
      return t
    })
  }

  mutateUsers(fn: (u: UsersFile) => void) {
    return this.withLock(this.paths.users, async () => {
      const u = await this.readUsers()
      fn(u)
      await this.writeJson(this.paths.users, u)
      return u
    })
  }

  mutateMeta(fn: (m: WorkspaceMeta) => void) {
    return this.withLock(this.paths.workspace, async () => {
      const m = await this.readMeta()
      fn(m)
      await this.writeJson(this.paths.workspace, m)
      return m
    })
  }

  // --- rilevamento cambiamenti --------------------------------------------

  /** Firma (mtime+size) di tutti i file del workspace. */
  async signature(): Promise<Signature> {
    const sig: Signature = {}
    const put = (key: string, s: FileStat | null) => {
      if (s) sig[key] = `${s.mtimeMs}:${s.size}`
    }
    const [w, u, t, d, a] = await Promise.all([
      this.fs.stat(this.paths.workspace),
      this.fs.stat(this.paths.users),
      this.fs.stat(this.paths.tree),
      this.fs.stat(this.paths.drive),
      this.fs.stat(this.paths.audit),
    ])
    put(FILES.workspace, w)
    put(FILES.users, u)
    put(FILES.tree, t)
    put(FILES.drive, d)
    put(FILES.audit, a)
    const ids = await this.listProjectIds()
    const stats = await Promise.all(ids.map(async (id) => [id, await this.fs.stat(await this.projectPath(id))] as const))
    for (const [id, s] of stats) put(`${FILES.projectsDir}/${id}`, s)
    return sig
  }

  watch(onChange: () => void) {
    return this.fs.watchDir(this.root, onChange)
  }
}
