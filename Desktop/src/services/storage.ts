/**
 * Lettura/scrittura di un workspace su cartella (locale o di rete).
 *
 *  <root>/workspace.json, users.json, tree.json, projects/<id>.json
 *
 * Regola d'oro: ogni modifica a un progetto è una mutazione read-before-write
 * (`mutateProject`): si rilegge il file, si applica la modifica, si incrementa
 * `version`, si scrive in modo atomico. Così due utenti che lavorano sullo
 * stesso progetto da PC diversi non si sovrascrivono a vicenda.
 */
import { getFs, type FileStat, type FsApi } from './fs'
import {
  AuditFileSchema,
  DriveFileSchema,
  ProjectSchema,
  TreeFileSchema,
  TrialFileSchema,
  UsersFileSchema,
  WorkspaceMetaSchema,
  type AuditFile,
  type DriveFile,
  type Project,
  type TreeFile,
  type TrialFile,
  type UsersFile,
  type WorkspaceMeta,
} from '@/types'
import { nowIso } from './ids'

export const FILES = {
  workspace: 'workspace.json',
  users: 'users.json',
  tree: 'tree.json',
  drive: 'drive.json',
  audit: 'audit.json',
  license: 'license.json',
  trial: 'trial.json',
  projectsDir: 'projects',
  backupDir: '_backup',
} as const

export type Signature = Record<string, string> // path relativo -> "mtime:size"

export class WorkspaceStorage {
  private fs!: FsApi
  private paths = { workspace: '', users: '', tree: '', drive: '', audit: '', license: '', trial: '', projectsDir: '', backupDir: '' }

  constructor(public readonly root: string) {}

  async init() {
    this.fs = await getFs()
    this.paths.workspace = await this.fs.join(this.root, FILES.workspace)
    this.paths.users = await this.fs.join(this.root, FILES.users)
    this.paths.tree = await this.fs.join(this.root, FILES.tree)
    this.paths.drive = await this.fs.join(this.root, FILES.drive)
    this.paths.audit = await this.fs.join(this.root, FILES.audit)
    this.paths.license = await this.fs.join(this.root, FILES.license)
    this.paths.trial = await this.fs.join(this.root, FILES.trial)
    this.paths.projectsDir = await this.fs.join(this.root, FILES.projectsDir)
    this.paths.backupDir = await this.fs.join(this.root, FILES.backupDir)
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
    await this.writeJson(this.paths.tree, { folders: [], categories: [], labels: [] } satisfies TreeFile)
  }

  // --- lettura -------------------------------------------------------------

  readMeta = () => this.readJson(this.paths.workspace, (r) => WorkspaceMetaSchema.parse(r))
  readUsers = () => this.readJson(this.paths.users, (r) => UsersFileSchema.parse(r))
  readTree = () => this.readJson(this.paths.tree, (r) => TreeFileSchema.parse(r))
  async readAudit(): Promise<AuditFile> {
    if (!(await this.fs.exists(this.paths.audit))) return { entries: [] }
    return this.readJson(this.paths.audit, (r) => AuditFileSchema.parse(r))
  }
  /** Aggiunge voci alla cronologia (read-before-write, come tutto il resto). */
  async appendAudit(entries: AuditFile['entries']) {
    const a = await this.readAudit()
    a.entries.push(...entries)
    if (a.entries.length > 5000) a.entries = a.entries.slice(-5000)
    await this.writeJson(this.paths.audit, a)
    return a
  }
  async readDrive(): Promise<DriveFile> {
    if (!(await this.fs.exists(this.paths.drive))) return DriveFileSchema.parse({})
    return this.readJson(this.paths.drive, (r) => DriveFileSchema.parse(r))
  }

  // --- licenza e prova -------------------------------------------------------

  /** Contenuto grezzo di license.json (la verifica della firma è in services/license.ts), null se assente. */
  async readLicenseRaw(): Promise<unknown | null> {
    if (!(await this.fs.exists(this.paths.license))) return null
    try {
      return JSON.parse(await this.fs.readText(this.paths.license)) as unknown
    } catch {
      return null
    }
  }
  writeLicense = (data: unknown) => this.writeJson(this.paths.license, data)
  async removeLicense() {
    if (await this.fs.exists(this.paths.license)) await this.fs.remove(this.paths.license)
  }
  async readTrial(): Promise<TrialFile | null> {
    if (!(await this.fs.exists(this.paths.trial))) return null
    try {
      return await this.readJson(this.paths.trial, (r) => TrialFileSchema.parse(r))
    } catch {
      return null
    }
  }
  /** Avvia la prova solo se non è mai stata avviata (read-before-write). */
  async startTrial(userId: string): Promise<TrialFile> {
    const existing = await this.readTrial()
    if (existing) return existing
    const t: TrialFile = { startedAt: nowIso(), startedBy: userId }
    await this.writeJson(this.paths.trial, t)
    return t
  }

  // --- backup (snapshot dei file JSON in _backup/<timestamp>/) ----------------

  /** Nomi degli snapshot esistenti, dal più recente. */
  async listBackups(): Promise<string[]> {
    if (!(await this.fs.exists(this.paths.backupDir))) return []
    const dirs = await this.fs.listDirs(this.paths.backupDir)
    return dirs.filter((d) => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d)).sort().reverse()
  }

  /** Copia tutti i file del workspace in un nuovo snapshot e tiene gli ultimi `keep`. Ritorna il nome creato. */
  async createBackup(keep = 14): Promise<string> {
    const stamp = nowIso().slice(0, 16).replace('T', '_').replace(':', '')
    const dir = await this.fs.join(this.paths.backupDir, stamp)
    await this.fs.mkdir(await this.fs.join(dir, FILES.projectsDir))
    const copy = async (from: string, to: string) => {
      if (await this.fs.exists(from)) await this.fs.writeTextAtomic(to, await this.fs.readText(from))
    }
    for (const name of [FILES.workspace, FILES.users, FILES.tree, FILES.drive, FILES.audit, FILES.license, FILES.trial]) {
      await copy(await this.fs.join(this.root, name), await this.fs.join(dir, name))
    }
    for (const id of await this.listProjectIds()) {
      await copy(await this.projectPath(id), await this.fs.join(dir, FILES.projectsDir, `${id}.json`))
    }
    const all = await this.listBackups()
    for (const old of all.slice(keep)) await this.fs.removeDir(await this.fs.join(this.paths.backupDir, old))
    return stamp
  }

  /** Riporta i file dello snapshot sopra quelli correnti (i progetti non presenti nello snapshot restano). */
  async restoreBackup(name: string) {
    const dir = await this.fs.join(this.paths.backupDir, name)
    if (!(await this.fs.exists(dir))) throw new Error('Snapshot non trovato.')
    const copy = async (from: string, to: string) => {
      if (await this.fs.exists(from)) await this.fs.writeTextAtomic(to, await this.fs.readText(from))
    }
    for (const name of [FILES.users, FILES.tree, FILES.drive, FILES.audit]) {
      await copy(await this.fs.join(dir, name), await this.fs.join(this.root, name))
    }
    const projectsDir = await this.fs.join(dir, FILES.projectsDir)
    if (await this.fs.exists(projectsDir)) {
      await this.fs.mkdir(this.paths.projectsDir)
      for (const f of await this.fs.readDir(projectsDir)) {
        if (f.endsWith('.json')) await copy(await this.fs.join(projectsDir, f), await this.fs.join(this.paths.projectsDir, f))
      }
    }
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

  writeMeta = (m: WorkspaceMeta) => this.writeJson(this.paths.workspace, m)
  writeUsers = (u: UsersFile) => this.writeJson(this.paths.users, u)
  writeTree = (t: TreeFile) => this.writeJson(this.paths.tree, t)
  writeDrive = (d: DriveFile) => this.writeJson(this.paths.drive, d)

  async writeProject(p: Project) {
    await this.fs.mkdir(this.paths.projectsDir)
    await this.writeJson(await this.projectPath(p.id), p)
  }

  async deleteProject(id: string) {
    await this.fs.remove(await this.projectPath(id))
  }

  /** Mutazione read-before-write. Ritorna il progetto aggiornato. */
  async mutateProject(id: string, actorId: string, fn: (p: Project) => void | boolean): Promise<Project> {
    const fresh = await this.readProject(id)
    const result = fn(fresh)
    if (result === false) return fresh
    fresh.version += 1
    fresh.updatedAt = nowIso()
    fresh.updatedBy = actorId
    await this.writeProject(fresh)
    return fresh
  }

  async mutateTree(fn: (t: TreeFile) => void) {
    const t = await this.readTree()
    fn(t)
    await this.writeTree(t)
    return t
  }

  async mutateUsers(fn: (u: UsersFile) => void) {
    const u = await this.readUsers()
    fn(u)
    await this.writeUsers(u)
    return u
  }

  // --- rilevamento cambiamenti --------------------------------------------

  /** Firma (mtime+size) di tutti i file del workspace. */
  async signature(): Promise<Signature> {
    const sig: Signature = {}
    const put = (key: string, s: FileStat | null) => {
      if (s) sig[key] = `${s.mtimeMs}:${s.size}`
    }
    const [w, u, t, d, a, l, tr] = await Promise.all([
      this.fs.stat(this.paths.workspace),
      this.fs.stat(this.paths.users),
      this.fs.stat(this.paths.tree),
      this.fs.stat(this.paths.drive),
      this.fs.stat(this.paths.audit),
      this.fs.stat(this.paths.license),
      this.fs.stat(this.paths.trial),
    ])
    put(FILES.workspace, w)
    put(FILES.users, u)
    put(FILES.tree, t)
    put(FILES.drive, d)
    put(FILES.audit, a)
    put(FILES.license, l)
    put(FILES.trial, tr)
    const ids = await this.listProjectIds()
    const stats = await Promise.all(ids.map(async (id) => [id, await this.fs.stat(await this.projectPath(id))] as const))
    for (const [id, s] of stats) put(`${FILES.projectsDir}/${id}`, s)
    return sig
  }

  watch(onChange: () => void) {
    return this.fs.watchDir(this.root, onChange)
  }
}
