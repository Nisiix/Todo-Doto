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
  ReadinessFileSchema,
  TreeFileSchema,
  UsersFileSchema,
  WorkspaceMetaSchema,
  type AuditFile,
  type DriveFile,
  type Project,
  type ReadinessFile,
  type TreeFile,
  type UsersFile,
  type WorkspaceMeta,
} from '@/types'
import { nowIso } from './ids'
import { normalizeSeq } from './gitLink'
import {
  autoBackupDue,
  backupFileName,
  backupsToDelete,
  listBackupInfos,
  packBackup,
  parseBackupName,
  unpackBackup,
  type BackupBundle,
  type BackupContent,
  type BackupInfo,
} from './backup'
import { common } from '@/i18n/common'
import { EncryptedDataError, isEncryptedBytes, isEncryptedText, type DataCipher } from './vault'

export interface LockOptions {
  /** Un lock rimasto identico per questo tempo è considerato abbandonato. */
  staleMs: number
  /** Un lock che dichiara un'età maggiore (orologio di chi l'ha creato) è abbandonato. */
  abandonedMs: number
  /** Oltre questo tempo di attesa il salvataggio fallisce con `LockBusyError`. */
  timeoutMs: number
}
/** Ogni quanto la firma dei file si ricalcola per intero anche se le cartelle non risultano cambiate. */
export const FULL_SIGNATURE_MS = 30_000
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
  /** Esito delle verifiche dei prerequisiti, un file per utente (readiness/<idUtente>.json). */
  readinessDir: 'readiness',
  /** Cartella predefinita delle copie di sicurezza (se non se ne sceglie un'altra). */
  backupsDir: 'backups',
} as const

export type Signature = Record<string, string> // path relativo -> "mtime:size"

/** Id ammessi per i file dei progetti: niente punti né separatori di percorso. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/
export const isSafeId = (id: string) => SAFE_ID.test(id)

/** Un file JSON è davvero dell'app: nome `<id>.json` e contenuto con lo stesso id nel campo `field`. */
async function isOwnJson(fs: FsApi, path: string, name: string, field: 'id' | 'userId') {
  if (!/\.json$/i.test(name) || !isSafeId(name.slice(0, -5))) return false
  try {
    const text = await fs.readText(path)
    // File cifrato dall'app (workspace con la cifratura attiva): il contenuto non si legge senza chiave
    if (isEncryptedText(text)) return true
    const raw = JSON.parse(text) as Record<string, unknown>
    return raw[field] === name.slice(0, -5)
  } catch {
    return false
  }
}
/** Un file di `projects/` è davvero un progetto dell'app. */
const isProjectFile = (fs: FsApi, path: string, name: string) => isOwnJson(fs, path, name, 'id')

export class WorkspaceStorage {
  private fs!: FsApi
  private paths = { workspace: '', users: '', tree: '', drive: '', audit: '', projectsDir: '', readinessDir: '' }
  /** Coda per file: le mutazioni di questo processo sullo stesso file, una alla volta. */
  private queues = new Map<string, Promise<unknown>>()
  /** Chi tiene i lock creati da questa istanza (es. "mario@PC-UFFICIO"), mostrato a chi aspetta. */
  lockOwner = ''
  /** Chiave dati del workspace (cifratura sul disco) e se le scritture vanno cifrate. */
  private cipher: DataCipher | null = null
  private encryptWrites = false

  /** Imposta la chiave dati: con `write` i file si scrivono cifrati (workspace.json resta in chiaro). */
  setCipher(cipher: DataCipher | null, write: boolean) {
    this.cipher = cipher
    this.encryptWrites = !!cipher && write
  }
  get hasCipher() {
    return !!this.cipher
  }

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
    this.paths.readinessDir = await this.fs.join(this.root, FILES.readinessDir)
    return this
  }

  /**
   * Elimina i dati di Todo Doto di un workspace: solo i file che
   * l'app stessa crea (workspace.json, users.json, tree.json, audit.json,
   * drive.json, projects/*.json, lock e file temporanei), poi le cartelle se
   * restano vuote. Qualsiasi altro file nella cartella resta dov'è.
   */
  static async deleteData(root: string) {
    const fs = await getFs()
    if (!(await WorkspaceStorage.isWorkspace(root))) return
    const own = (name: string) => /\.json\.lock$|\.json\.[a-z0-9]+\.tmp$/i.test(name)
    const projectsDir = await fs.join(root, FILES.projectsDir)
    for (const e of await fs.listDir(projectsDir).catch(() => [])) {
      if (e.isDir) continue
      const path = await fs.join(projectsDir, e.name)
      if (own(e.name) || (await isProjectFile(fs, path, e.name))) await fs.remove(path)
    }
    await fs.remove(projectsDir).catch(() => {}) // solo se vuota
    const readinessDir = await fs.join(root, FILES.readinessDir)
    for (const e of await fs.listDir(readinessDir).catch(() => [])) {
      if (e.isDir) continue
      const path = await fs.join(readinessDir, e.name)
      if (own(e.name) || (await isOwnJson(fs, path, e.name, 'userId'))) await fs.remove(path)
    }
    await fs.remove(readinessDir).catch(() => {}) // solo se vuota
    // Copie di sicurezza nella cartella predefinita (quelle in altre cartelle restano)
    const backupsDir = await fs.join(root, FILES.backupsDir)
    for (const e of await fs.listDir(backupsDir).catch(() => [])) {
      if (!e.isDir && (parseBackupName(e.name) || /^pgm-backup\.lock$|\.pgmbackup\.[a-z0-9]+\.tmp$/i.test(e.name))) await fs.remove(await fs.join(backupsDir, e.name))
    }
    await fs.remove(backupsDir).catch(() => {}) // solo se vuota
    const files: string[] = [FILES.users, FILES.tree, FILES.drive, FILES.audit, FILES.workspace]
    for (const e of await fs.listDir(root).catch(() => [])) {
      if (!e.isDir && (files.includes(e.name) || own(e.name))) await fs.remove(await fs.join(root, e.name))
    }
    await fs.remove(root).catch(() => {}) // solo se vuota
  }

  static async isWorkspace(root: string) {
    const fs = await getFs()
    return fs.exists(await fs.join(root, FILES.workspace))
  }

  // --- helpers -------------------------------------------------------------

  private async readJson<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
    const text = await this.fs.readText(path)
    return parse(JSON.parse(await this.decode(text)))
  }

  /** Testo di un file: in chiaro così com'è, cifrato decifrato con la chiave dati. */
  private async decode(text: string): Promise<string> {
    if (!isEncryptedText(text)) return text
    if (!this.cipher) throw new EncryptedDataError()
    try {
      return await this.cipher.decryptText(text)
    } catch {
      throw new EncryptedDataError() // chiave diversa (es. password cambiata altrove)
    }
  }

  /** JSON compatto: file più piccoli da trasferire e analizzare (quelli formattati si leggono comunque). */
  private async writeJson(path: string, data: unknown) {
    const json = JSON.stringify(data)
    // workspace.json resta in chiaro: serve per aprire il workspace (contiene la chiave avvolta)
    const out = this.encryptWrites && this.cipher && path !== this.paths.workspace ? await this.cipher.encryptText(json) : json
    return this.fs.writeTextAtomic(path, out)
  }

  /**
   * Riscrive tutti i file del workspace nel formato attuale (cifrato o in
   * chiaro), ognuno sotto il suo lock. Serve ad attivare o disattivare la
   * cifratura: nel frattempo i lettori accettano entrambi i formati.
   */
  async rewriteAll() {
    const same = (r: unknown) => r
    const rewrite = async (path: string) => {
      if (!(await this.fs.exists(path))) return
      await this.withLock(path, async () => this.writeJson(path, await this.readJson(path, same)))
    }
    for (const p of [this.paths.users, this.paths.tree, this.paths.drive, this.paths.audit]) await rewrite(p)
    for (const id of await this.listProjectIds()) await rewrite(await this.projectPath(id))
    if (await this.fs.exists(this.paths.readinessDir)) {
      for (const name of await this.fs.readDir(this.paths.readinessDir)) {
        if (name.endsWith('.json') && isSafeId(name.slice(0, -5))) await rewrite(await this.fs.join(this.paths.readinessDir, name))
      }
    }
  }

  /**
   * File del progetto nella cartella Dati (`projects/<id>.json`). L'id viene
   * validato: un id manomesso (es. "../..") non può portare fuori dalla cartella.
   */
  projectPath(id: string) {
    if (!isSafeId(id)) throw new Error(`Id di progetto non valido: ${id}`)
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
    const p = await this.readJson(await this.projectPath(id), (r) => ProjectSchema.parse(r))
    // Task dei file di versioni precedenti: numerati in memoria (il file si aggiorna alla prossima modifica)
    normalizeSeq(p)
    return p
  }

  async listProjectIds(): Promise<string[]> {
    if (!(await this.fs.exists(this.paths.projectsDir))) return []
    const names = await this.fs.readDir(this.paths.projectsDir)
    return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter(isSafeId)
  }

  // --- configurazione dei PC (un file per utente) -------------------------------

  private async readinessPath(userId: string) {
    if (!isSafeId(userId)) throw new Error(`Id utente non valido: ${userId}`)
    return this.fs.join(this.paths.readinessDir, `${userId}.json`)
  }
  /** Esiti di tutti gli utenti; i file illeggibili o non validi si saltano. */
  async readAllReadiness(): Promise<Record<string, ReadinessFile>> {
    if (!(await this.fs.exists(this.paths.readinessDir))) return {}
    const out: Record<string, ReadinessFile> = {}
    for (const name of await this.fs.readDir(this.paths.readinessDir)) {
      if (!name.endsWith('.json') || !isSafeId(name.slice(0, -5))) continue
      const f = await this.readReadiness(name.slice(0, -5)).catch(() => null)
      if (f) out[f.userId] = f
    }
    return out
  }
  async readReadiness(userId: string): Promise<ReadinessFile | null> {
    const path = await this.readinessPath(userId)
    if (!(await this.fs.exists(path))) return null
    const f = await this.readJson(path, (r) => ReadinessFileSchema.parse(r))
    return f.userId === userId ? f : null
  }
  /** Ognuno scrive solo il proprio file: niente conflitti fra PC. */
  async writeReadiness(f: ReadinessFile) {
    await this.fs.mkdir(this.paths.readinessDir)
    const path = await this.readinessPath(f.userId)
    await this.withLock(path, () => this.writeJson(path, f))
  }

  // --- copie di sicurezza ---------------------------------------------------------

  /** Cartella delle copie: quella scelta, o `backups` nella cartella Dati. */
  async backupDir(meta: Pick<WorkspaceMeta, 'backup'>) {
    return meta.backup.dir.trim() || this.fs.join(this.root, FILES.backupsDir)
  }
  /** Tutti i dati del workspace in un colpo solo (per la copia). */
  async snapshot(): Promise<BackupContent> {
    const ids = await this.listProjectIds()
    const projects = (await Promise.all(ids.map((id) => this.readProject(id).catch(() => null)))).filter((p): p is Project => !!p)
    return {
      workspace: await this.readMeta(),
      users: await this.readUsers(),
      tree: await this.readTree(),
      drive: await this.readDrive(),
      audit: await this.readAudit(),
      projects,
    }
  }
  /** Copie presenti nella cartella (solo i file con il nome delle copie dell'app). */
  async listBackups(dir: string): Promise<BackupInfo[]> {
    if (!(await this.fs.exists(dir))) return []
    return listBackupInfos(await this.fs.readDir(dir))
  }
  private async backupPath(dir: string, name: string) {
    if (!parseBackupName(name)) throw new Error(`Nome di copia non valido: ${name}`)
    return this.fs.join(dir, name)
  }
  async readBackup(dir: string, name: string): Promise<BackupBundle> {
    let bytes = await this.fs.readBinary(await this.backupPath(dir, name))
    if (isEncryptedBytes(bytes)) {
      if (!this.cipher) throw new EncryptedDataError()
      try {
        bytes = await this.cipher.decryptBytes(bytes)
      } catch {
        throw new EncryptedDataError()
      }
    }
    return unpackBackup(bytes)
  }
  /**
   * Crea una copia sotto lock della cartella delle copie. Con `onlyIfDue` (le
   * automatiche) la si crea solo se l'ultima automatica ha più di un giorno:
   * così, fra più PC, ogni giorno la fa uno solo. Poi applica la rotazione.
   * Restituisce il nome del file creato, o null se non serviva.
   */
  async createBackup(dir: string, bundle: BackupBundle, onlyIfDue: boolean): Promise<string | null> {
    await this.fs.mkdir(dir)
    const lockTarget = await this.fs.join(dir, 'pgm-backup')
    return this.withLock(lockTarget, async () => {
      const list = await this.listBackups(dir)
      if (onlyIfDue && !autoBackupDue(list)) return null
      let at = new Date(bundle.createdAt)
      let name = backupFileName(at, bundle.reason)
      // Due copie nello stesso secondo: si sposta di un secondo
      while (list.some((b) => b.name === name)) name = backupFileName((at = new Date(at.getTime() + 1000)), bundle.reason)
      const packed = await packBackup(bundle)
      // Workspace cifrato: anche la copia (che può stare su un altro disco o server)
      await this.fs.writeBinary(await this.backupPath(dir, name), this.encryptWrites && this.cipher ? await this.cipher.encryptBytes(new Uint8Array(packed)) : packed)
      // Rotazione: si eliminano SOLO copie dell'app (nome riconosciuto) in questa cartella
      for (const old of backupsToDelete([...list, { name, at, reason: bundle.reason }])) {
        await this.fs.remove(await this.backupPath(dir, old.name)).catch(() => {})
      }
      return name
    })
  }
  /**
   * Riscrive i dati del workspace da una copia. I progetti che non erano nella
   * copia vengono tolti dal workspace (solo il loro file nella cartella Dati;
   * le cartelle dei progetti non si toccano). `keep` conserva i campi del
   * workspace che non devono tornare indietro (password, impostazioni copie).
   */
  async restoreAll(content: BackupContent, keep: Pick<WorkspaceMeta, 'auth' | 'backup' | 'encryption'>) {
    await this.withLock(this.paths.workspace, () => this.writeJson(this.paths.workspace, { ...content.workspace, ...keep }))
    await this.withLock(this.paths.users, () => this.writeJson(this.paths.users, content.users))
    await this.withLock(this.paths.tree, () => this.writeJson(this.paths.tree, content.tree))
    await this.withLock(this.paths.drive, () => this.writeJson(this.paths.drive, content.drive))
    await this.withLock(this.paths.audit, () => this.writeJson(this.paths.audit, content.audit))
    const restored = new Set(content.projects.map((p) => p.id))
    for (const p of content.projects) await this.restoreProject(p)
    for (const id of await this.listProjectIds()) if (!restored.has(id)) await this.deleteProject(id)
  }
  /** Rimette un progetto com'era nella copia (sostituendo quello attuale, se c'è). */
  async restoreProject(p: Project) {
    await this.fs.mkdir(this.paths.projectsDir)
    const path = await this.projectPath(p.id)
    await this.withLock(path, () => this.writeJson(path, p))
  }

  // --- scrittura -----------------------------------------------------------

  /** Sostituisce la struttura Drive sincronizzata (il contenuto è sempre l'intera struttura). */
  writeDrive = (d: DriveFile) => this.withLock(this.paths.drive, () => this.writeJson(this.paths.drive, d))

  async writeProject(p: Project) {
    await this.fs.mkdir(this.paths.projectsDir)
    await this.writeJson(await this.projectPath(p.id), p)
  }

  /**
   * Elimina dal workspace SOLO il file del progetto nella cartella Dati
   * (`projects/<id>.json`). La cartella del progetto sul disco (stack.sourcePath)
   * e i suoi file non vengono mai toccati.
   */
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

  /**
   * Firma (mtime+size) di tutti i file del workspace.
   *
   * Scorciatoia per le cartelle di rete: ogni scrittura dell'app crea e rinomina
   * file nella cartella che li contiene (il .lock e il file temporaneo), quindi
   * ne cambia la data di modifica. Se le date della cartella del workspace, di
   * projects/ e di readiness/ sono quelle dell'ultima firma completa, nulla è
   * cambiato e la firma resta quella: 3 richieste invece di una per file. Per sicurezza la
   * firma completa si ricalcola comunque ogni FULL_SIGNATURE_MS.
   */
  async signature(): Promise<Signature> {
    const [root, projects, readiness] = await Promise.all([this.fs.stat(this.root), this.fs.stat(this.paths.projectsDir), this.fs.stat(this.paths.readinessDir)])
    const key = root?.mtimeMs && projects?.mtimeMs ? `${root.mtimeMs}|${projects.mtimeMs}|${readiness?.mtimeMs ?? 0}` : ''
    const q = this.quick
    if (key && q && q.key === key && Date.now() - q.at < FULL_SIGNATURE_MS) return { ...q.sig }
    const sig = await this.fullSignature()
    this.quick = key ? { key, sig, at: Date.now() } : null
    return { ...sig }
  }
  /** Ultima firma completa e date delle cartelle a cui si riferisce (vedi signature()). */
  private quick: { key: string; sig: Signature; at: number } | null = null

  private async fullSignature(): Promise<Signature> {
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
    if (await this.fs.exists(this.paths.readinessDir)) {
      const users = (await this.fs.readDir(this.paths.readinessDir)).filter((n) => n.endsWith('.json') && isSafeId(n.slice(0, -5)))
      const rs = await Promise.all(users.map(async (n) => [n.slice(0, -5), await this.fs.stat(await this.fs.join(this.paths.readinessDir, n))] as const))
      for (const [id, st] of rs) put(`${FILES.readinessDir}/${id}`, st)
    }
    return sig
  }

  watch(onChange: () => void) {
    return this.fs.watchDir(this.root, onChange)
  }
}
