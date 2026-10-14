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

  constructor(public readonly root: string) {}

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
