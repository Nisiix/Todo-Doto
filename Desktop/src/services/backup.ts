/**
 * Copie di sicurezza dei dati del workspace: formato del file, nome, quali
 * tenere. Funzioni pure (più impacchettamento con gzip quando disponibile).
 *
 * Una copia contiene i dati di Todo Doto (workspace, utenti,
 * cartelle ed etichette, Drive, cronologia, progetti con task, allegati e
 * stack). Non contiene MAI i file dei progetti né le password ricordate.
 */
import { z } from 'zod'
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

export const BACKUP_EXT = '.pgmbackup'
export const BACKUP_REASONS = ['auto', 'manual', 'prerestore'] as const
export type BackupReason = (typeof BACKUP_REASONS)[number]

/** Quante copie tenere: le automatiche per giorno e per settimana, le altre per numero. */
export const KEEP = { daily: 7, weekly: 4, manual: 10, prerestore: 5 } as const

export const BackupBundleSchema = z.object({
  format: z.literal('pgm-backup'),
  version: z.number(),
  createdAt: z.string(),
  createdBy: z.string().default(''), // nome dell'utente
  host: z.string().default(''),
  reason: z.enum(BACKUP_REASONS),
  workspace: WorkspaceMetaSchema,
  users: UsersFileSchema,
  tree: TreeFileSchema,
  drive: DriveFileSchema,
  audit: AuditFileSchema,
  projects: z.array(ProjectSchema),
})
export type BackupBundle = z.infer<typeof BackupBundleSchema>

export interface BackupContent {
  workspace: WorkspaceMeta
  users: UsersFile
  tree: TreeFile
  drive: DriveFile
  audit: AuditFile
  projects: Project[]
}

export interface BackupInfo {
  name: string
  at: Date
  reason: BackupReason
}

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

/** Nome del file: pgm-AAAAMMGG-hhmmss-motivo.pgmbackup (ordinabile, ora locale). */
export const backupFileName = (d: Date, reason: BackupReason) => `pgm-${stamp(d)}-${reason}${BACKUP_EXT}`

const NAME_RE = /^pgm-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(auto|manual|prerestore)\.pgmbackup$/

/** Solo i file con questo nome esatto sono copie dell'app (gli unici che l'app può eliminare). */
export function parseBackupName(name: string): BackupInfo | null {
  const m = NAME_RE.exec(name)
  if (!m) return null
  const [, y, mo, d, h, mi, s, reason] = m
  const at = new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!)
  return Number.isNaN(at.getTime()) ? null : { name, at, reason: reason as BackupReason }
}

/** Elenco delle copie, la più recente per prima (i nomi non riconosciuti si ignorano). */
export const listBackupInfos = (names: string[]) =>
  names.map(parseBackupName).filter((b): b is BackupInfo => !!b).sort((a, b) => b.at.getTime() - a.at.getTime())

/** Ultima copia automatica (è quella che decide se ne serve una nuova). */
export const lastAuto = (list: BackupInfo[]) => list.find((b) => b.reason === 'auto') ?? null

/** Serve una copia automatica: nessuna, o l'ultima ha più di un giorno. */
export const autoBackupDue = (list: BackupInfo[], now = new Date()) => {
  const last = lastAuto(list)
  return !last || now.getTime() - last.at.getTime() >= 24 * 3_600_000 - 60_000
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
/** Settimana (lunedì come inizio) come chiave. */
function weekKey(d: Date) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  return dayKey(t)
}

/**
 * Copie da eliminare per la rotazione: delle automatiche si tiene la più
 * recente di ciascuno degli ultimi KEEP.daily giorni, poi la più recente di
 * ciascuna delle KEEP.weekly settimane successive; delle manuali e di quelle
 * prima di un ripristino, le ultime KEEP.manual / KEEP.prerestore.
 */
export function backupsToDelete(list: BackupInfo[]): BackupInfo[] {
  const sorted = [...list].sort((a, b) => b.at.getTime() - a.at.getTime())
  const keep = new Set<string>()
  const autos = sorted.filter((x) => x.reason === 'auto')
  // Giornaliere: la più recente di ciascuno degli ultimi KEEP.daily giorni con una copia
  const days = new Set<string>()
  let oldestDaily = Infinity
  for (const b of autos) {
    const d = dayKey(b.at)
    if (days.has(d) || days.size >= KEEP.daily) continue
    days.add(d)
    keep.add(b.name)
    oldestDaily = Math.min(oldestDaily, b.at.getTime())
  }
  // Settimanali: fra le più vecchie, la più recente di ciascuna settimana, per KEEP.weekly settimane
  const weeks = new Set<string>()
  for (const b of autos) {
    if (b.at.getTime() >= oldestDaily || days.has(dayKey(b.at))) continue
    const w = weekKey(b.at)
    if (weeks.has(w) || weeks.size >= KEEP.weekly) continue
    weeks.add(w)
    keep.add(b.name)
  }
  for (const reason of ['manual', 'prerestore'] as const) {
    sorted.filter((x) => x.reason === reason).slice(0, KEEP[reason]).forEach((b) => keep.add(b.name))
  }
  return sorted.filter((b) => !keep.has(b.name))
}

// --- impacchettamento ----------------------------------------------------------

const GZIP = [0x1f, 0x8b]
const hasStreams = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

/** Copia → byte (JSON compresso con gzip; JSON semplice dove gzip non c'è). */
export async function packBackup(bundle: BackupBundle): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify(bundle))
  return hasStreams() ? through(json, new CompressionStream('gzip')) : json
}

/** Byte → copia validata (accetta sia gzip sia JSON semplice). */
export async function unpackBackup(bytes: Uint8Array): Promise<BackupBundle> {
  const isGzip = bytes[0] === GZIP[0] && bytes[1] === GZIP[1]
  const json = isGzip ? await through(bytes, new DecompressionStream('gzip')) : bytes
  return BackupBundleSchema.parse(JSON.parse(new TextDecoder().decode(json)))
}

/** Riepilogo per l'elenco nel ripristino. */
export function summarizeBackup(b: BackupBundle) {
  const active = b.projects.filter((p) => !p.trashedAt)
  return {
    projects: active.length,
    trashed: b.projects.length - active.length,
    items: active.reduce((n, p) => n + p.items.filter((i) => i.bucket !== 'trash').length, 0),
  }
}
