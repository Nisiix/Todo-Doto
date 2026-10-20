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
  PresenceFileSchema,
  ProjectSchema,
  ReadinessFileSchema,
  HealthWeekSchema,
  TemplatesFileSchema,
  TreeFileSchema,
  UsersFileSchema,
  WorkspaceMetaSchema,
  type AuditFile,
  type DriveFile,
  type HealthWeek,
  type TemplatesFile,
  type PresenceFile,
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
  /** Chi lavora a cosa, un file per utente (presence/<idUtente>.json). */
  presenceDir: 'presence',
  /** Cronologia a file per mese e per chi scrive (audit/<AAAA-MM>.<scrittore>.json): niente file condiviso da riscrivere. */
  auditDir: 'audit',
  /** Giornale delle modifiche, uno per PC che scrive (changes/<scrittore>.json): gli altri sanno quali file rileggere. */
  changesDir: 'changes',
  /** Segnaposto degli invii giornalieri (riepilogo del mattino): uno per giorno, li crea il PC che invia. */
  mailDir: 'mail',
  /** Cartella predefinita delle copie di sicurezza (se non se ne sceglie un'altra). */
  backupsDir: 'backups',
  /** Modelli di progetto condivisi. */
  templates: 'templates.json',
  /** Calendari .ics delle scadenze (in chiaro: mai con i dati cifrati). */
  calendarsDir: 'calendari',
  /** Salute dei progetti, una istantanea per settimana (health/<lunedì>.json). */
  healthDir: 'health',
} as const

export type Signature = Record<string, string> // path relativo -> "mtime:size"
const SECTIONS = ['root', 'projects', 'readiness', 'presence', 'audit'] as const

/** Progetti grandi: da CHUNK_SPLIT_AT task in su, i task stanno in «capitoli» di circa CHUNK_SIZE (projects/<id>.c<n>.json). */
export const CHUNK_SPLIT_AT = 300
export const CHUNK_SIZE = 150
const CHUNK_RE = /^([A-Za-z0-9_-]{1,80})\.c(\d{1,3})\.json$/
const AUDIT_RE = /^(\d{4}-\d{2})\.([A-Za-z0-9_-]{1,120})\.json$/
const JOURNAL_RE = /^[A-Za-z0-9_-]{1,120}\.json$/
/** Righe tenute nel giornale di ogni PC: chi è rimasto indietro di più rilegge tutto. */
const JOURNAL_KEEP = 300
/** Mesi di cronologia letti all'apertura; i file propri più vecchi di un anno si tolgono. */
const AUDIT_MONTHS = 6
const AUDIT_KEEP_MONTHS = 12

/** Quanti capitoli: si dividono i progetti grandi e si torna a un file solo quando diventano piccoli. */
export function chunkCount(items: number, prev: number): number {
  if (prev) {
    if (items < CHUNK_SPLIT_AT / 3) return 0
    const t = Math.ceil(items / CHUNK_SIZE)
    return t > prev * 2 ? t : prev
  }
  return items >= CHUNK_SPLIT_AT ? Math.ceil(items / CHUNK_SIZE) : 0
}
/** Capitolo di un task: dipende solo dal suo id, così un task resta sempre nello stesso file. */
export function chunkOf(itemId: string, chunks: number): number {
  let h = 0x811c9dc5
  for (let i = 0; i < itemId.length; i++) h = Math.imul(h ^ itemId.charCodeAt(i), 0x01000193) >>> 0
  return h % chunks
}
const monthOf = (iso: string) => iso.slice(0, 7)
const monthsAgo = (n: number) => {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 7)
}
type SplitInfo = { chunks: number; order: string[] }
/** Prefisso delle chiavi di ogni sezione nei giornali (la radice ha pochi file: si rilegge sempre). */
const SECTION_PREFIX: Record<(typeof SECTIONS)[number], string | null> = { root: null, projects: 'projects/', readiness: 'readiness/', presence: 'presence/', audit: 'audit/' }
interface SectionCache {
  at: number
  changesKey: string
  parts: Record<(typeof SECTIONS)[number], { key: string; sig: Signature }>
}

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
/** Un capitolo di un progetto grande (`<id>.c<n>.json` con lo stesso id dentro). */
async function isChunkFile(fs: FsApi, path: string, name: string) {
  const m = CHUNK_RE.exec(name)
  if (!m) return false
  try {
    const text = await fs.readText(path)
    if (isEncryptedText(text)) return true
    return (JSON.parse(text) as { projectId?: string }).projectId === m[1]
  } catch {
    return false
  }
}

export class WorkspaceStorage {
  private fs!: FsApi
  private paths = { workspace: '', users: '', tree: '', drive: '', audit: '', projectsDir: '', readinessDir: '', presenceDir: '', auditDir: '', changesDir: '' }
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
    this.paths.presenceDir = await this.fs.join(this.root, FILES.presenceDir)
    this.paths.auditDir = await this.fs.join(this.root, FILES.auditDir)
    this.paths.changesDir = await this.fs.join(this.root, FILES.changesDir)
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
      if (own(e.name) || (await isProjectFile(fs, path, e.name)) || (await isChunkFile(fs, path, e.name))) await fs.remove(path)
    }
    await fs.remove(projectsDir).catch(() => {}) // solo se vuota
    for (const [dirName, re] of [[FILES.auditDir, AUDIT_RE], [FILES.changesDir, JOURNAL_RE]] as const) {
      const dir = await fs.join(root, dirName)
      for (const e of await fs.listDir(dir).catch(() => [])) {
        if (!e.isDir && (re.test(e.name) || own(e.name))) await fs.remove(await fs.join(dir, e.name))
      }
      await fs.remove(dir).catch(() => {}) // solo se vuota
    }
    const readinessDir = await fs.join(root, FILES.readinessDir)
    for (const e of await fs.listDir(readinessDir).catch(() => [])) {
      if (e.isDir) continue
      const path = await fs.join(readinessDir, e.name)
      if (own(e.name) || (await isOwnJson(fs, path, e.name, 'userId'))) await fs.remove(path)
    }
    await fs.remove(readinessDir).catch(() => {}) // solo se vuota
    const presenceDir = await fs.join(root, FILES.presenceDir)
    for (const e of await fs.listDir(presenceDir).catch(() => [])) {
      if (e.isDir) continue
      const path = await fs.join(presenceDir, e.name)
      if (own(e.name) || (await isOwnJson(fs, path, e.name, 'userId'))) await fs.remove(path)
    }
    await fs.remove(presenceDir).catch(() => {}) // solo se vuota
    const mailDir = await fs.join(root, FILES.mailDir)
    for (const e of await fs.listDir(mailDir).catch(() => [])) {
      if (!e.isDir && /^[a-z]+-\d{4}-\d{2}-\d{2}\.json$/.test(e.name)) await fs.remove(await fs.join(mailDir, e.name))
    }
    await fs.remove(mailDir).catch(() => {}) // solo se vuota
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
    await this.fs.writeTextAtomic(path, out)
    this.pendingKeys.add(this.keyOf(path))
  }

  // --- giornale delle modifiche -----------------------------------------------------
  //
  // Ogni PC che scrive tiene il suo giornale (changes/<scrittore>.json): un
  // numero progressivo e il file toccato. Chi controlla i cambiamenti legge solo
  // i giornali cambiati e interroga solo i file indicati, invece di chiedere la
  // data di tutti i file: il costo non cresce più con il numero di progetti.

  /** Chi scrive (utente + PC), per il nome del giornale e dei file di cronologia; vuoto finché non si sa. */
  private writerId = ''
  setWriter(userId: string, host: string) {
    const id = `${userId}-${host}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120)
    if (id !== this.writerId) {
      this.writerId = id
      this.journal = null
    }
  }
  private pendingKeys = new Set<string>()
  private journal: { seq: number; entries: { seq: number; key: string }[] } | null = null

  /** Percorso relativo alla cartella Dati, senza `.json` (es. "projects/prj_1"). */
  private keyOf(path: string) {
    const n = (x: string) => x.replace(/\\/g, '/').replace(/\/+$/, '')
    const rel = n(path).startsWith(n(this.root) + '/') ? n(path).slice(n(this.root).length + 1) : n(path)
    return rel.replace(/\.json$/i, '')
  }

  /** Scrive nel proprio giornale i file toccati dall'ultima operazione. */
  async flushJournal() {
    if (!this.pendingKeys.size) return
    const keys = [...this.pendingKeys]
    this.pendingKeys.clear()
    if (!this.writerId) return
    await this.serialize('::journal', async () => {
      const path = await this.fs.join(this.paths.changesDir, `${this.writerId}.json`)
      if (!this.journal) {
        try {
          const j = JSON.parse(await this.fs.readText(path)) as { seq?: number; entries?: { seq: number; key: string }[] }
          this.journal = { seq: j.seq ?? 0, entries: j.entries ?? [] }
        } catch {
          this.journal = { seq: 0, entries: [] }
        }
      }
      const j = this.journal
      for (const key of keys) j.entries.push({ seq: ++j.seq, key })
      if (j.entries.length > JOURNAL_KEEP) j.entries = j.entries.slice(-JOURNAL_KEEP)
      await this.fs.mkdir(this.paths.changesDir)
      await this.fs.writeTextAtomic(path, JSON.stringify({ writer: this.writerId, seq: j.seq, entries: j.entries }))
    }).catch(() => {
      /* il giornale è un'ottimizzazione: senza, gli altri rileggono le date di tutti i file */
    })
  }

  /** Ultimo numero letto per ogni giornale e la sua firma (per non rileggerlo se non cambia). */
  private journalSeen = new Map<string, number>()
  private journalStats = new Map<string, string>()

  /**
   * File cambiati secondo i giornali dall'ultima lettura. null = non si sa
   * (giornale illeggibile o qualcuno rimasto troppo indietro): si rilegge tutto.
   */
  private async readJournals(): Promise<Set<string> | null> {
    try {
      if (!(await this.fs.exists(this.paths.changesDir))) return new Set()
      const keys = new Set<string>()
      let unknown = false
      for (const name of await this.fs.readDir(this.paths.changesDir)) {
        if (!JOURNAL_RE.test(name)) continue
        const path = await this.fs.join(this.paths.changesDir, name)
        const st = await this.fs.stat(path)
        const sig = st ? `${st.mtimeMs}:${st.size}` : ''
        if (sig && this.journalStats.get(name) === sig) continue
        this.journalStats.set(name, sig)
        const j = JSON.parse(await this.fs.readText(path)) as { entries?: { seq: number; key: string }[] }
        const entries = j.entries ?? []
        const seen = this.journalSeen.get(name)
        if (seen !== undefined && entries.length && entries[0]!.seq > seen + 1) unknown = true
        for (const e of entries) if (seen === undefined || e.seq > seen) keys.add(e.key)
        this.journalSeen.set(name, entries.length ? entries[entries.length - 1]!.seq : (seen ?? 0))
      }
      return unknown ? null : keys
    } catch {
      return null
    }
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
    for (const p of [this.paths.users, this.paths.tree, this.paths.drive, this.paths.audit, await this.fs.join(this.root, FILES.templates)]) await rewrite(p)
    const healthDir = await this.fs.join(this.root, FILES.healthDir)
    for (const name of await this.fs.readDir(healthDir).catch(() => [] as string[])) {
      if (/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) await rewrite(await this.fs.join(healthDir, name))
    }
    // Con i dati cifrati i calendari .ics (in chiaro per forza) non devono restare nella cartella
    if (this.encryptWrites && this.cipher) {
      const calDir = await this.fs.join(this.root, FILES.calendarsDir)
      for (const name of await this.fs.readDir(calDir).catch(() => [] as string[])) {
        if (name.endsWith('.ics')) await this.fs.remove(await this.fs.join(calDir, name)).catch(() => {})
      }
    }
    for (const id of await this.listProjectIds()) await rewrite(await this.projectPath(id))
    for (const name of await this.fs.readDir(this.paths.projectsDir).catch(() => [])) {
      if (CHUNK_RE.test(name)) await rewrite(await this.fs.join(this.paths.projectsDir, name))
    }
    for (const name of await this.fs.readDir(this.paths.auditDir).catch(() => [])) {
      if (AUDIT_RE.test(name)) await rewrite(await this.fs.join(this.paths.auditDir, name))
    }
    this.chunkCache.clear()
    this.auditCache.clear()
    for (const dir of [this.paths.readinessDir, this.paths.presenceDir]) {
      if (!(await this.fs.exists(dir))) continue
      for (const name of await this.fs.readDir(dir)) {
        if (name.endsWith('.json') && isSafeId(name.slice(0, -5))) await rewrite(await this.fs.join(dir, name))
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
        await this.flushJournal()
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
  /** Voci lette per file (audit.json delle versioni precedenti e audit/<mese>.<scrittore>.json). */
  private auditCache = new Map<string, AuditFile['entries']>()

  /**
   * Cronologia: il vecchio audit.json (scritto dalle versioni precedenti) più i
   * file per mese e per scrittore degli ultimi mesi, in ordine di tempo (ultime
   * 5000 voci). `changed`: chiavi dei file cambiati ("audit.json",
   * "audit/<mese>.<scrittore>"): gli altri si prendono da quanto già letto.
   */
  async readAudit(changed?: Iterable<string>): Promise<AuditFile> {
    const ch = changed ? new Set(changed) : null
    const want = (key: string) => !ch || ch.has(key) || !this.auditCache.has(key)
    if (want('audit.json')) {
      const legacy = (await this.fs.exists(this.paths.audit)) ? (await this.readJson(this.paths.audit, (r) => AuditFileSchema.parse(r))).entries : []
      this.auditCache.set('audit.json', legacy)
    }
    const from = monthsAgo(AUDIT_MONTHS)
    const names = (await this.fs.readDir(this.paths.auditDir).catch(() => [])).filter((n) => {
      const m = AUDIT_RE.exec(n)
      return !!m && m[1]! >= from
    })
    const present = new Set(['audit.json', ...names.map((n) => `audit/${n.slice(0, -5)}`)])
    for (const k of [...this.auditCache.keys()]) if (!present.has(k)) this.auditCache.delete(k)
    for (const n of names) {
      const key = `audit/${n.slice(0, -5)}`
      if (!want(key)) continue
      const entries = await this.readJson(await this.fs.join(this.paths.auditDir, n), (r) => AuditFileSchema.parse(r).entries).catch(() => [])
      this.auditCache.set(key, entries)
    }
    const seen = new Set<string>()
    const all = [...this.auditCache.values()].flat().filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    all.sort((a, b) => a.at.localeCompare(b.at))
    return { entries: all.slice(-5000) }
  }
  /**
   * Aggiunge voci alla cronologia. Ogni PC scrive solo i propri file (uno al
   * mese): niente lock condiviso fra tutti né riscrittura dell'intera cronologia.
   * Prima di sapere chi scrive (workspace appena creato) si usa audit.json.
   */
  async appendAudit(entries: AuditFile['entries']) {
    if (!entries.length) return
    if (!this.writerId) {
      await this.withLock(this.paths.audit, async () => {
        const a = (await this.fs.exists(this.paths.audit)) ? await this.readJson(this.paths.audit, (r) => AuditFileSchema.parse(r)) : { entries: [] }
        a.entries.push(...entries)
        if (a.entries.length > 5000) a.entries = a.entries.slice(-5000)
        await this.writeJson(this.paths.audit, a)
        this.auditCache.set('audit.json', a.entries)
      })
      return
    }
    await this.fs.mkdir(this.paths.auditDir)
    const byMonth = new Map<string, AuditFile['entries']>()
    for (const e of entries) byMonth.set(monthOf(e.at), [...(byMonth.get(monthOf(e.at)) ?? []), e])
    for (const [month, list] of byMonth) {
      const name = `${month}.${this.writerId}.json`
      const path = await this.fs.join(this.paths.auditDir, name)
      await this.withLock(path, async () => {
        const isNew = !(await this.fs.exists(path))
        const a = isNew ? { entries: [] as AuditFile['entries'] } : await this.readJson(path, (r) => AuditFileSchema.parse(r))
        a.entries.push(...list)
        await this.writeJson(path, a)
        this.auditCache.set(`audit/${name.slice(0, -5)}`, a.entries)
        // Mese nuovo: si tolgono i propri file più vecchi di un anno
        if (isNew) {
          const limit = monthsAgo(AUDIT_KEEP_MONTHS)
          for (const n of await this.fs.readDir(this.paths.auditDir).catch(() => [])) {
            const m = AUDIT_RE.exec(n)
            if (m && m[2] === this.writerId && m[1]! < limit) await this.fs.remove(await this.fs.join(this.paths.auditDir, n)).catch(() => {})
          }
        }
      })
    }
  }
  async readDrive(): Promise<DriveFile> {
    if (!(await this.fs.exists(this.paths.drive))) return DriveFileSchema.parse({})
    return this.readJson(this.paths.drive, (r) => DriveFileSchema.parse(r))
  }

  async readProject(id: string): Promise<Project> {
    const raw = await this.readJson(await this.projectPath(id), (r) => r as Record<string, unknown>)
    // Progetto grande: i task stanno nei capitoli (il file principale ha solo l'elenco)
    const split = raw.items && !Array.isArray(raw.items) ? (raw.items as SplitInfo) : null
    this.splitOf.set(id, split?.chunks ?? 0)
    if (split) raw.items = await this.readChunks(id, split)
    const p = ProjectSchema.parse(raw)
    // Task dei file di versioni precedenti: numerati in memoria (il file si aggiorna alla prossima modifica)
    normalizeSeq(p)
    return p
  }

  // --- progetti grandi divisi in capitoli -------------------------------------------
  //
  // Il file principale tiene il progetto con `items: { chunks, order }` (un
  // oggetto, non un elenco: le versioni precedenti dell'app non lo leggono e
  // quindi non possono riscriverlo perdendo i task) e i task stanno in
  // projects/<id>.c<n>.json. Una modifica a un task riscrive solo il suo
  // capitolo e il file principale; chi rilegge prende dalla memoria i capitoli
  // non cambiati.

  /** Capitoli di ogni progetto all'ultima lettura (0 = file unico). */
  private splitOf = new Map<string, number>()
  private chunkCache = new Map<string, { sig: string; items: unknown[] }>()

  private chunkPath(id: string, n: number) {
    if (!isSafeId(id) || !Number.isInteger(n) || n < 0 || n > 999) throw new Error(`Capitolo non valido: ${id}.${n}`)
    return this.fs.join(this.paths.projectsDir, `${id}.c${n}.json`)
  }

  private async readChunks(id: string, split: SplitInfo): Promise<unknown[]> {
    const byId = new Map<string, unknown>()
    const extra: unknown[] = []
    for (let n = 0; n < split.chunks; n++) {
      const path = await this.chunkPath(id, n)
      const st = await this.fs.stat(path)
      const sig = st ? `${st.mtimeMs}:${st.size}` : ''
      let items = sig ? this.chunkCache.get(path) : undefined
      if (!items || items.sig !== sig) {
        const data = st ? await this.readJson(path, (r) => r as { projectId?: string; items?: unknown[] }) : { items: [] }
        items = { sig, items: data.items ?? [] }
        if (sig) this.chunkCache.set(path, items)
      }
      for (const it of items.items) {
        const iid = (it as { id?: string }).id
        if (iid) byId.set(iid, it)
        else extra.push(it)
      }
    }
    const out: unknown[] = []
    for (const iid of split.order ?? []) {
      const it = byId.get(iid)
      if (it) {
        out.push(it)
        byId.delete(iid)
      }
    }
    // Task non ancora nell'elenco (lettura a metà di un salvataggio): in fondo
    return [...out, ...byId.values(), ...extra]
  }

  /** Quanti capitoli ha ora sul disco il progetto (per toglierli quando si riscrive). */
  private async splitOnDisk(id: string): Promise<number> {
    try {
      const raw = await this.readJson(await this.projectPath(id), (r) => r as { items?: unknown })
      return raw.items && !Array.isArray(raw.items) ? ((raw.items as SplitInfo).chunks ?? 0) : 0
    } catch {
      return 0
    }
  }

  /**
   * Scrive un progetto in un file o in capitoli. `prev`: capitoli sul disco;
   * `before`: i capitoli com'erano letti (si riscrivono solo quelli cambiati).
   */
  private async writeProjectFiles(p: Project, prev: number, before: string[] | null) {
    const path = await this.projectPath(p.id)
    const k = chunkCount(p.items.length, prev)
    if (k) {
      const groups: Project['items'][] = Array.from({ length: k }, () => [])
      for (const it of p.items) groups[chunkOf(it.id, k)]!.push(it)
      for (let n = 0; n < k; n++) {
        const items = groups[n]!
        if (k === prev && before && before[n] === JSON.stringify(items)) continue
        await this.writeJson(await this.chunkPath(p.id, n), { projectId: p.id, n, items })
      }
    }
    for (let n = k; n < prev; n++) {
      const cp = await this.chunkPath(p.id, n)
      await this.fs.remove(cp).catch(() => {})
      this.chunkCache.delete(cp)
      this.pendingKeys.add(this.keyOf(cp))
    }
    await this.writeJson(path, k ? { ...p, items: { chunks: k, order: p.items.map((i) => i.id) } satisfies SplitInfo } : p)
    this.splitOf.set(p.id, k)
  }
  private chunkJson(p: Project, k: number): string[] | null {
    if (!k) return null
    const groups: Project['items'][] = Array.from({ length: k }, () => [])
    for (const it of p.items) groups[chunkOf(it.id, k)]!.push(it)
    return groups.map((g) => JSON.stringify(g))
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

  // --- chi lavora a cosa (un file per utente) ------------------------------------

  private async presencePath(userId: string) {
    if (!isSafeId(userId)) throw new Error(`Id utente non valido: ${userId}`)
    return this.fs.join(this.paths.presenceDir, `${userId}.json`)
  }
  /** Indicazioni di tutti gli utenti; i file illeggibili o non validi si saltano. */
  async readAllPresence(): Promise<Record<string, PresenceFile>> {
    if (!(await this.fs.exists(this.paths.presenceDir))) return {}
    const out: Record<string, PresenceFile> = {}
    for (const name of await this.fs.readDir(this.paths.presenceDir)) {
      if (!name.endsWith('.json') || !isSafeId(name.slice(0, -5))) continue
      const f = await this.readPresence(name.slice(0, -5)).catch(() => null)
      if (f) out[f.userId] = f
    }
    return out
  }
  async readPresence(userId: string): Promise<PresenceFile | null> {
    const path = await this.presencePath(userId)
    if (!(await this.fs.exists(path))) return null
    const f = await this.readJson(path, (r) => PresenceFileSchema.parse(r))
    return f.userId === userId ? f : null
  }
  /** Ognuno scrive solo il proprio file: niente lock condivisi né conflitti fra PC. */
  async writePresence(f: PresenceFile) {
    await this.fs.mkdir(this.paths.presenceDir)
    const path = await this.presencePath(f.userId)
    await this.withLock(path, () => this.writeJson(path, f))
  }

  // --- invii giornalieri ------------------------------------------------------------

  /**
   * Prende l'invio di oggi (es. "digest-2026-10-20"): true solo per il primo PC
   * che crea il segnaposto (creazione esclusiva, atomica anche in rete).
   * I segnaposto più vecchi di 30 giorni si tolgono.
   */
  async claimDaily(key: string): Promise<boolean> {
    if (!/^[a-z]+-\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Chiave non valida: ${key}`)
    const dir = await this.fs.join(this.root, FILES.mailDir)
    await this.fs.mkdir(dir)
    const ok = await this.fs.createExclusive(await this.fs.join(dir, `${key}.json`), JSON.stringify({ by: this.lockOwner, at: new Date().toISOString() }))
    if (ok) {
      const limit = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      for (const name of await this.fs.readDir(dir).catch(() => [])) {
        const d = /-(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1]
        if (d && d < limit) await this.fs.remove(await this.fs.join(dir, name)).catch(() => {})
      }
    }
    return ok
  }

  // --- salute dei progetti: una istantanea per settimana ---------------------------

  /**
   * Scrive l'istantanea della settimana solo se non c'è ancora (creazione
   * esclusiva: un solo PC la scrive, senza lock). Cifrata come gli altri file.
   * Fuori dal giornale delle modifiche: gli altri PC la leggono quando serve.
   */
  async writeHealthWeek(f: HealthWeek): Promise<boolean> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.week)) throw new Error(`Settimana non valida: ${f.week}`)
    const dir = await this.fs.join(this.root, FILES.healthDir)
    await this.fs.mkdir(dir)
    const json = JSON.stringify(f)
    const text = this.encryptWrites && this.cipher ? await this.cipher.encryptText(json) : json
    const ok = await this.fs.createExclusive(await this.fs.join(dir, `${f.week}.json`), text)
    if (ok) {
      // Si tiene poco più di un anno
      const names = (await this.fs.readDir(dir).catch(() => [] as string[])).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort()
      for (const n of names.slice(0, Math.max(0, names.length - 60))) await this.fs.remove(await this.fs.join(dir, n)).catch(() => {})
    }
    return ok
  }

  /** Ultime istantanee settimanali, dalla più recente; quelle illeggibili si saltano. */
  async readHealthHistory(limit = 12): Promise<HealthWeek[]> {
    const dir = await this.fs.join(this.root, FILES.healthDir)
    if (!(await this.fs.exists(dir))) return []
    const names = (await this.fs.readDir(dir)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse().slice(0, limit)
    const out: HealthWeek[] = []
    for (const n of names) {
      const f = await this.readJson(await this.fs.join(dir, n), (r) => HealthWeekSchema.parse(r)).catch(() => null)
      if (f) out.push(f)
    }
    return out
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
    // La cronologia torna quella della copia: via i file per mese (solo quelli dell'app)
    for (const n of await this.fs.readDir(this.paths.auditDir).catch(() => [])) {
      if (!AUDIT_RE.test(n)) continue
      const ap = await this.fs.join(this.paths.auditDir, n)
      await this.fs.remove(ap).catch(() => {})
      this.pendingKeys.add(this.keyOf(ap))
    }
    this.auditCache.clear()
    await this.flushJournal()
    const restored = new Set(content.projects.map((p) => p.id))
    for (const p of content.projects) await this.restoreProject(p)
    for (const id of await this.listProjectIds()) if (!restored.has(id)) await this.deleteProject(id)
  }
  /** Rimette un progetto com'era nella copia (sostituendo quello attuale, se c'è). */
  async restoreProject(p: Project) {
    await this.fs.mkdir(this.paths.projectsDir)
    const path = await this.projectPath(p.id)
    await this.withLock(path, async () => this.writeProjectFiles(p, await this.splitOnDisk(p.id), null))
  }

  // --- scrittura -----------------------------------------------------------

  /** Sostituisce la struttura Drive sincronizzata (il contenuto è sempre l'intera struttura). */
  writeDrive = (d: DriveFile) => this.withLock(this.paths.drive, () => this.writeJson(this.paths.drive, d))

  async writeProject(p: Project) {
    await this.fs.mkdir(this.paths.projectsDir)
    await this.writeProjectFiles(p, await this.splitOnDisk(p.id), null)
    await this.flushJournal()
  }

  /**
   * Elimina dal workspace SOLO il file del progetto nella cartella Dati
   * (`projects/<id>.json`). La cartella del progetto sul disco (stack.sourcePath)
   * e i suoi file non vengono mai toccati.
   */
  async deleteProject(id: string) {
    const path = await this.projectPath(id)
    await this.withLock(path, async () => {
      const chunks = await this.splitOnDisk(id)
      await this.fs.remove(path)
      this.pendingKeys.add(this.keyOf(path))
      for (let n = 0; n < chunks; n++) {
        const cp = await this.chunkPath(id, n)
        await this.fs.remove(cp).catch(() => {})
        this.chunkCache.delete(cp)
        this.pendingKeys.add(this.keyOf(cp))
      }
      this.splitOf.delete(id)
    })
  }

  /** Mutazione sotto lock: rilegge, applica `fn`, incrementa `version`, scrive. Ritorna il progetto aggiornato. */
  async mutateProject(id: string, actorId: string, fn: (p: Project) => void | boolean): Promise<Project> {
    const path = await this.projectPath(id)
    return this.withLock(path, async () => {
      const fresh = await this.readProject(id)
      const prev = this.splitOf.get(id) ?? 0
      const before = this.chunkJson(fresh, prev)
      const result = fn(fresh)
      if (result === false) return fresh
      fresh.version += 1
      fresh.updatedAt = nowIso()
      fresh.updatedBy = actorId
      await this.writeProjectFiles(fresh, prev, before)
      return fresh
    })
  }

  async readTemplates(): Promise<TemplatesFile> {
    const path = await this.fs.join(this.root, FILES.templates)
    if (!(await this.fs.exists(path))) return TemplatesFileSchema.parse({})
    return this.readJson(path, (r) => TemplatesFileSchema.parse(r))
  }
  async mutateTemplates(fn: (t: TemplatesFile) => void): Promise<TemplatesFile> {
    const path = await this.fs.join(this.root, FILES.templates)
    return this.withLock(path, async () => {
      const t = await this.readTemplates()
      fn(t)
      await this.writeJson(path, t)
      return t
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
   * ne cambia la data di modifica. La firma è divisa in sezioni, una per
   * cartella (radice, projects/, readiness/, presence/): si rileggono i file
   * solo delle cartelle la cui data è cambiata. Quando non cambia nulla
   * servono 4 richieste invece di una per file; quando un collega rinnova la
   * sua presenza si rilegge solo presence/, non i progetti. Per sicurezza la
   * firma completa si ricalcola comunque ogni FULL_SIGNATURE_MS.
   */
  async signature(): Promise<Signature> {
    const dirs = [this.root, this.paths.projectsDir, this.paths.readinessDir, this.paths.presenceDir, this.paths.auditDir, this.paths.changesDir]
    const stats = await Promise.all(dirs.map((d) => this.fs.stat(d)))
    // Cartella del workspace non raggiungibile (rete, VPN): è un errore, non «tutti i file cancellati»
    if (!stats[0] && !(await this.fs.exists(this.root))) throw new Error(`unreachable: ${this.root}`)
    const full = !this.sections || Date.now() - this.sections.at >= FULL_SIGNATURE_MS || !stats[0]?.mtimeMs
    const prev = full ? null : this.sections
    // Giornali delle modifiche: quali file sono cambiati (null = non si sa, si rilegge la cartella)
    const changesKey = String(stats[5]?.mtimeMs ?? 0)
    let journal: Set<string> | null = null
    if (full || !prev || prev.changesKey !== changesKey || !stats[5]?.mtimeMs) journal = await this.readJournals()
    else journal = new Set()
    const parts = await Promise.all(
      SECTIONS.map(async (name, i) => {
        const key = String(stats[i]?.mtimeMs ?? 0)
        const old = prev?.parts[name]
        // Cartella assente: resta tale finché non compare. Data non affidabile (0): si rilegge sempre
        if (old && old.key === key && (stats[i] === null || stats[i]?.mtimeMs)) return old
        // Cartella cambiata: se i giornali dicono quali file, si interrogano solo quelli
        const prefix = SECTION_PREFIX[name]
        const touched = journal && prefix ? [...journal].filter((k) => k.startsWith(prefix)) : []
        if (old && journal && prefix && touched.length && stats[i]?.mtimeMs) {
          const sig = { ...old.sig }
          await Promise.all(
            touched.map(async (k) => {
              const st = await this.fs.stat(await this.fs.join(this.root, `${k}.json`))
              if (st) sig[k] = `${st.mtimeMs}:${st.size}`
              else delete sig[k]
            }),
          )
          return { key, sig }
        }
        return { key, sig: await this.sectionSignature(name) }
      }),
    )
    this.sections = {
      at: full ? Date.now() : this.sections!.at,
      changesKey,
      parts: Object.fromEntries(SECTIONS.map((n, i) => [n, parts[i]!])) as SectionCache['parts'],
    }
    return Object.assign({}, ...parts.map((p) => p.sig)) as Signature
  }
  /** Ultime firme per sezione e date delle cartelle a cui si riferiscono (vedi signature()). */
  private sections: SectionCache | null = null

  private async sectionSignature(name: (typeof SECTIONS)[number]): Promise<Signature> {
    const sig: Signature = {}
    const put = (key: string, s: FileStat | null) => {
      if (s) sig[key] = `${s.mtimeMs}:${s.size}`
    }
    if (name === 'root') {
      const files = [FILES.workspace, FILES.users, FILES.tree, FILES.drive, FILES.audit] as const
      const paths = [this.paths.workspace, this.paths.users, this.paths.tree, this.paths.drive, this.paths.audit]
      const st = await Promise.all(paths.map((p) => this.fs.stat(p)))
      files.forEach((f, i) => put(f, st[i] ?? null))
    } else if (name === 'projects') {
      if (!(await this.fs.exists(this.paths.projectsDir))) return sig
      // File principali dei progetti e capitoli dei progetti grandi
      const names = (await this.fs.readDir(this.paths.projectsDir)).filter((n) => (n.endsWith('.json') && isSafeId(n.slice(0, -5))) || CHUNK_RE.test(n))
      const stats = await Promise.all(names.map(async (n) => [n.slice(0, -5), await this.fs.stat(await this.fs.join(this.paths.projectsDir, n))] as const))
      for (const [stem, s] of stats) put(`${FILES.projectsDir}/${stem}`, s)
    } else if (name === 'audit') {
      const from = monthsAgo(AUDIT_MONTHS)
      const names = (await this.fs.readDir(this.paths.auditDir).catch(() => [])).filter((n) => {
        const m = AUDIT_RE.exec(n)
        return !!m && m[1]! >= from
      })
      const stats = await Promise.all(names.map(async (n) => [n.slice(0, -5), await this.fs.stat(await this.fs.join(this.paths.auditDir, n))] as const))
      for (const [stem, s] of stats) put(`${FILES.auditDir}/${stem}`, s)
    } else {
      const dir = name === 'readiness' ? this.paths.readinessDir : this.paths.presenceDir
      const prefix = name === 'readiness' ? FILES.readinessDir : FILES.presenceDir
      if (await this.fs.exists(dir)) {
        const users = (await this.fs.readDir(dir)).filter((n) => n.endsWith('.json') && isSafeId(n.slice(0, -5)))
        const rs = await Promise.all(users.map(async (n) => [n.slice(0, -5), await this.fs.stat(await this.fs.join(dir, n))] as const))
        for (const [id, st] of rs) put(`${prefix}/${id}`, st)
      }
    }
    return sig
  }

  watch(onChange: () => void) {
    return this.fs.watchDir(this.root, onChange)
  }
}
