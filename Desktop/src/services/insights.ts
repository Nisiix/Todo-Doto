/**
 * Analisi di un progetto calcolate dai dati che ci sono già, senza nulla da
 * inserire in più:
 *
 *  - tempi di ciclo: quanto passa da creato a confermato, da confermato a
 *    completato e da creato a completato (mediane sui completati recenti), e
 *    da quanto tempo aspettano i task ancora da fare;
 *  - attenzioni: ciò che sta andando storto senza che nessuno l'abbia
 *    segnalato (domande senza risposta, urgenze senza nessuno, task fermi…),
 *    dal più grave.
 *
 * Funzioni pure: nessuna dipendenza da Vue o dallo store.
 */
import dayjs from 'dayjs'
import { PRIORITY_RANK, type Item, type Project, type Status } from '@/types'

const DAY = 86_400_000
const days = (from: string, to: string) => Math.max(0, (Date.parse(to) - Date.parse(from)) / DAY)

/** Mediana, o null con meno di `min` valori (troppo pochi per dire qualcosa). */
export function median(xs: number[], min = 3): number | null {
  if (xs.length < min) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export const AGE_BANDS = [
  { key: 'week', maxDays: 7 },
  { key: 'month', maxDays: 30 },
  { key: 'quarter', maxDays: 90 },
  { key: 'older', maxDays: Infinity },
] as const
export type AgeBand = (typeof AGE_BANDS)[number]['key']

export interface CycleStats {
  /** Completati considerati (negli ultimi `windowDays` giorni). */
  sample: number
  /** Mediane in giorni; null se i dati non bastano. */
  toConfirm: number | null
  confirmToDone: number | null
  leadTime: number | null
  /** Task da fare per età (dalla creazione) e stato. */
  aging: Record<AgeBand, Record<Status, number>>
  /** Età mediana dei task da fare, in giorni. */
  openAge: number | null
}

const zeroStatus = (): Record<Status, number> => ({ da_valutare: 0, da_definire: 0, confermato: 0 })

export function cycleStats(items: Item[], now = new Date().toISOString(), windowDays = 90): CycleStats {
  const since = new Date(Date.parse(now) - windowDays * DAY).toISOString()
  const done = items.filter((i) => i.bucket === 'done' && i.completedAt && i.completedAt >= since)
  const toConfirm = items.filter((i) => i.confirmedAt && i.confirmedAt >= since).map((i) => days(i.createdAt, i.confirmedAt!))
  const confirmToDone = done.filter((i) => i.confirmedAt).map((i) => days(i.confirmedAt!, i.completedAt!))
  const leadTime = done.map((i) => days(i.createdAt, i.completedAt!))
  const aging = Object.fromEntries(AGE_BANDS.map((b) => [b.key, zeroStatus()])) as CycleStats['aging']
  const ages: number[] = []
  for (const i of items) {
    if (i.bucket !== 'todo') continue
    const age = days(i.createdAt, now)
    ages.push(age)
    const band = AGE_BANDS.find((b) => age < b.maxDays)!.key
    aging[band][i.status]++
  }
  return {
    sample: done.length,
    toConfirm: median(toConfirm),
    confirmToDone: median(confirmToDone),
    leadTime: median(leadTime),
    aging,
    openAge: median(ages, 1),
  }
}

// ---------------------------------------------------------------------------
// Attenzioni
// ---------------------------------------------------------------------------

export const SIGNAL_KINDS = ['overdue', 'urgent_unassigned', 'unanswered', 'removed_assignee', 'confirmed_no_due', 'stale'] as const
export type SignalKind = (typeof SIGNAL_KINDS)[number]
export type Severity = 'high' | 'medium' | 'low'

export interface Signal {
  kind: SignalKind
  severity: Severity
  item: Item
  /** Giorni di ritardo, di attesa o di inattività (secondo il tipo). */
  days: number
  /** Domanda senza risposta, se il segnale la riguarda. */
  questionId?: string
}

export interface SignalOptions {
  now?: string
  /** Utenti ancora nel workspace: un task assegnato a qualcun altro è senza responsabile. */
  userIds?: string[]
  /** Giorni senza risposta prima di segnalare una domanda (gravità alta al doppio). */
  questionDays?: number
  /** Giorni senza alcuna attività prima di segnalare un task fermo. */
  staleDays?: number
}

/** Ultima attività su un task: modifica, commento, domanda o risposta. */
export function lastActivity(i: Item): string {
  let last = i.updatedAt ?? i.createdAt
  const bump = (t: string) => {
    if (t > last) last = t
  }
  bump(i.createdAt)
  if (i.confirmedAt) bump(i.confirmedAt)
  for (const c of i.comments) bump(c.createdAt)
  for (const q of i.questions) {
    bump(q.createdAt)
    for (const a of q.answers) bump(a.createdAt)
  }
  return last
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

/** Segnali dei task da fare del progetto, dal più grave; per ogni task il più importante. */
export function projectSignals(project: Pick<Project, 'items'>, opts: SignalOptions = {}): Signal[] {
  const now = opts.now ?? new Date().toISOString()
  const today = dayjs(now).format('YYYY-MM-DD')
  const qDays = opts.questionDays ?? 3
  const staleDays = opts.staleDays ?? 21
  const users = opts.userIds ? new Set(opts.userIds) : null
  const out: Signal[] = []
  for (const i of project.items) {
    if (i.bucket !== 'todo') continue
    const add = (s: Omit<Signal, 'item'>) => out.push({ ...s, item: i })
    if (i.dueDate && i.dueDate < today) add({ kind: 'overdue', severity: 'high', days: Math.round(days(`${i.dueDate}T00:00:00`, `${today}T00:00:00`)) })
    if (i.priority === 'immediata' && !i.assigneeId) add({ kind: 'urgent_unassigned', severity: 'high', days: Math.floor(days(i.createdAt, now)) })
    for (const q of i.questions) {
      if (q.resolved || q.answers.length) continue
      const waited = days(q.createdAt, now)
      if (waited >= qDays) add({ kind: 'unanswered', severity: waited >= qDays * 2 ? 'high' : 'medium', days: Math.floor(waited), questionId: q.id })
    }
    if (users && i.assigneeId && !users.has(i.assigneeId)) add({ kind: 'removed_assignee', severity: 'medium', days: 0 })
    if (i.status === 'confermato' && !i.dueDate) add({ kind: 'confirmed_no_due', severity: 'low', days: i.confirmedAt ? Math.floor(days(i.confirmedAt, now)) : 0 })
    const idle = days(lastActivity(i), now)
    if (idle >= staleDays) add({ kind: 'stale', severity: idle >= staleDays * 3 ? 'medium' : 'low', days: Math.floor(idle) })
  }
  // Un solo segnale per task (il più grave; a parità, quello che viene prima nell'elenco dei tipi)
  const best = new Map<string, Signal>()
  const rank = (s: Signal) => SEVERITY_RANK[s.severity] * 10 + SIGNAL_KINDS.indexOf(s.kind)
  for (const s of out) {
    const cur = best.get(s.item.id)
    if (!cur || rank(s) < rank(cur)) best.set(s.item.id, s)
  }
  return [...best.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] || b.days - a.days,
  )
}
