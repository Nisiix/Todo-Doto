/**
 * Salute di un progetto (semaforo) e stato dei PC per progetto. Funzioni pure.
 *
 *  - rosso:  almeno 3 task in ritardo, una tappa in ritardo, o 3 segnali gravi;
 *  - giallo: un segnale grave, segnali da guardare, o PC di chi ci lavora non pronti;
 *  - verde:  niente di tutto questo.
 *
 * I motivi, con il loro numero, spiegano il colore.
 */
import type { HealthLevel, Prerequisite, ReadinessFile } from '@/types'
import type { Signal, SignalKind } from './insights'
import { isCurrent, prereqHash } from './readiness'

export type HealthReason = SignalKind | 'late_milestone' | 'pc_missing'

export interface HealthInfo {
  level: HealthLevel
  reasons: { key: HealthReason; n: number }[]
}

export function projectHealth(input: { signals: Signal[]; lateMilestones: number; pcMissing: number }): HealthInfo {
  const counts = new Map<HealthReason, number>()
  const bump = (k: HealthReason, n = 1) => n && counts.set(k, (counts.get(k) ?? 0) + n)
  for (const s of input.signals) bump(s.kind)
  bump('late_milestone', input.lateMilestones)
  bump('pc_missing', input.pcMissing)
  const high = input.signals.filter((s) => s.severity === 'high').length
  const medium = input.signals.filter((s) => s.severity === 'medium').length
  const overdue = counts.get('overdue') ?? 0
  const level: HealthLevel = overdue >= 3 || input.lateMilestones > 0 || high >= 3 ? 'red' : high || medium || input.pcMissing ? 'yellow' : 'green'
  // Prima i motivi più gravi, nell'ordine dei tipi
  const ORDER: HealthReason[] = ['overdue', 'late_milestone', 'urgent_unassigned', 'unanswered', 'due_in_absence', 'removed_assignee', 'pc_missing', 'confirmed_no_due', 'stale']
  const reasons = ORDER.filter((k) => counts.has(k)).map((key) => ({ key, n: counts.get(key)! }))
  return { level, reasons }
}

export type PcState = 'ready' | 'missing' | 'unknown'

export interface PcStatus {
  state: PcState
  /** Programmi mancanti o vecchi (se `missing`). */
  missing: string[]
  checkedAt: string | null
}

/**
 * Stato del PC di un utente per un progetto, dall'esito delle verifiche:
 * pronto, mancano programmi, o non si sa (mai verificato, esito vecchio o
 * prerequisiti cambiati). null se il progetto non ha prerequisiti.
 */
export function pcStatus(projectId: string, prereqs: Pick<Prerequisite, 'id' | 'name' | 'version' | 'check'>[], file: ReadinessFile | undefined, now = Date.now()): PcStatus | null {
  if (!prereqs.length) return null
  const entry = file?.projects[projectId]
  if (!entry || !isCurrent(entry, prereqHash(prereqs), now)) return { state: 'unknown', missing: [], checkedAt: entry?.checkedAt ?? null }
  return entry.missing.length
    ? { state: 'missing', missing: entry.missing.map((x) => x.name), checkedAt: entry.checkedAt }
    : { state: 'ready', missing: [], checkedAt: entry.checkedAt }
}
