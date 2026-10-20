/**
 * Carico per persona e per settimana, in tutti i progetti: quante scadenze (e,
 * se stimate, quante ore) cadono in ogni settimana, rispetto alla disponibilità
 * della persona tolte le assenze. Si vedono così le collisioni tra progetti
 * diversi e i task che scadono mentre chi li ha è assente, con a chi passarli.
 *
 * Settimane da lunedì a domenica; i giorni di assenza contano solo da lunedì
 * a venerdì. Funzioni pure.
 */
import dayjs from 'dayjs'
import type { Absence, Item, Project, User } from '@/types'

export interface LoadTask {
  project: Pick<Project, 'id' | 'name'>
  item: Item
}

export type LoadLevel = 'none' | 'ok' | 'high' | 'over'

export interface WeekCell {
  /** Lunedì della settimana (YYYY-MM-DD). */
  week: string
  tasks: LoadTask[]
  /** Ore stimate dei task della settimana (quelli senza stima non contano). */
  hours: number
  /** Giorni lavorativi di assenza nella settimana. */
  absentDays: number
  /** Ore disponibili tolte le assenze; null se la persona non ha indicato le ore. */
  capacity: number | null
  level: LoadLevel
  /** Task che scadono in un giorno di assenza di chi li ha. */
  inAbsence: LoadTask[]
  /** Progetti diversi con scadenze nella settimana. */
  projects: number
}

export interface LoadRow {
  /** null = task non assegnati. */
  userId: string | null
  overdue: LoadTask[]
  weeks: WeekCell[]
}

/** Lunedì della settimana di `date`. */
export const mondayOf = (date: string) => {
  const d = dayjs(date)
  return d.subtract((d.day() + 6) % 7, 'day').format('YYYY-MM-DD')
}

/** Lunedì delle `n` settimane a partire da quella di oggi. */
export const weekStarts = (today: string, n: number) => Array.from({ length: n }, (_, i) => dayjs(mondayOf(today)).add(i, 'week').format('YYYY-MM-DD'))

/** Assenza che copre il giorno indicato, se c'è. */
export const absenceOn = (absences: Pick<Absence, 'from' | 'to'>[], date: string) => absences.find((a) => a.from <= date && date <= a.to) ?? null

/** Giorni da lunedì a venerdì di [from, to] coperti da un'assenza. */
export function absentWorkdays(absences: Pick<Absence, 'from' | 'to'>[], from: string, to: string): number {
  let n = 0
  for (let d = dayjs(from); !d.isAfter(dayjs(to), 'day'); d = d.add(1, 'day')) {
    const wd = d.day()
    if (wd === 0 || wd === 6) continue
    if (absenceOn(absences, d.format('YYYY-MM-DD'))) n++
  }
  return n
}

/** Sopra questo numero di scadenze in una settimana, senza ore indicate, il carico è troppo. */
export const TASKS_PER_WEEK = 5

function level(count: number, hours: number, capacity: number | null): LoadLevel {
  if (!count) return 'none'
  if (capacity !== null) {
    if (capacity <= 0 || hours > capacity) return 'over'
    return hours > capacity * 0.8 ? 'high' : 'ok'
  }
  if (count > TASKS_PER_WEEK) return 'over'
  return count >= TASKS_PER_WEEK - 1 ? 'high' : 'ok'
}

export function loadGrid(projects: Pick<Project, 'id' | 'name' | 'items' | 'trashedAt'>[], users: Pick<User, 'id' | 'weeklyHours' | 'absences'>[], today: string, weeks = 6): LoadRow[] {
  const starts = weekStarts(today, weeks)
  const last = dayjs(starts[starts.length - 1]).add(6, 'day').format('YYYY-MM-DD')
  const byUser = new Map(users.map((u) => [u.id, u]))
  const rows = new Map<string | null, LoadRow>()
  const rowOf = (id: string | null) => {
    let r = rows.get(id)
    if (!r) {
      const u = id ? byUser.get(id) : undefined
      r = {
        userId: id,
        overdue: [],
        weeks: starts.map((week) => {
          const absentDays = u ? absentWorkdays(u.absences, week, dayjs(week).add(6, 'day').format('YYYY-MM-DD')) : 0
          const capacity = u && u.weeklyHours > 0 ? Math.round(((u.weeklyHours * (5 - absentDays)) / 5) * 10) / 10 : null
          return { week, tasks: [], hours: 0, absentDays, capacity, level: 'none' as LoadLevel, inAbsence: [], projects: 0 }
        }),
      }
      rows.set(id, r)
    }
    return r
  }
  // Ogni persona ha la sua riga anche senza scadenze (si vede chi è libero)
  for (const u of users) rowOf(u.id)
  for (const p of projects) {
    if (p.trashedAt) continue
    for (const item of p.items) {
      if (item.bucket !== 'todo' || !item.dueDate) continue
      const id = item.assigneeId && byUser.has(item.assigneeId) ? item.assigneeId : null
      const task = { project: { id: p.id, name: p.name }, item }
      const row = rowOf(id)
      if (item.dueDate < today) {
        row.overdue.push(task)
        continue
      }
      if (item.dueDate > last) continue
      const cell = row.weeks.find((w) => w.week === mondayOf(item.dueDate!))!
      cell.tasks.push(task)
      cell.hours += item.estimateHours ?? 0
      const u = id ? byUser.get(id) : undefined
      if (u && absenceOn(u.absences, item.dueDate)) cell.inAbsence.push(task)
    }
  }
  for (const r of rows.values())
    for (const c of r.weeks) {
      c.level = level(c.tasks.length, c.hours, c.capacity)
      c.projects = new Set(c.tasks.map((t) => t.project.id)).size
      c.tasks.sort((a, b) => a.item.dueDate!.localeCompare(b.item.dueDate!))
    }
  // Prima le persone (nell'ordine dato), in fondo i non assegnati
  return [...users.map((u) => rows.get(u.id)!), ...(rows.has(null) ? [rows.get(null)!] : [])]
}

/**
 * A chi passare un task: le persone non assenti il giorno della scadenza, dalla
 * meno carica in quella settimana (livello di carico, poi meno scadenze, poi più ore libere).
 */
export function suggestAssignees(item: Pick<Item, 'dueDate' | 'assigneeId'>, grid: LoadRow[], users: Pick<User, 'id' | 'absences'>[], max = 3): string[] {
  if (!item.dueDate) return []
  const week = mondayOf(item.dueDate)
  const RANK: Record<LoadLevel, number> = { none: 0, ok: 1, high: 2, over: 3 }
  const of = (id: string) => {
    const c = grid.find((r) => r.userId === id)?.weeks.find((w) => w.week === week)
    return { level: c ? RANK[c.level] : 0, count: c?.tasks.length ?? 0, free: c?.capacity != null ? c.capacity - c.hours : 0 }
  }
  return users
    .filter((u) => u.id !== item.assigneeId && !absenceOn(u.absences, item.dueDate!))
    .map((u) => ({ id: u.id, ...of(u.id) }))
    .sort((a, b) => a.level - b.level || a.count - b.count || b.free - a.free)
    .slice(0, max)
    .map((x) => x.id)
}
