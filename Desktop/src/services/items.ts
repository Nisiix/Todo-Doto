/**
 * Logica pura sugli elementi: ordinamento, scadenze, conteggi.
 * Nessuna dipendenza da Vue o dallo store: facile da testare e riusare.
 */
import dayjs from 'dayjs'
import { PRIORITY_RANK, type Bucket, type Item, type ItemFilter, type Project } from '@/types'

export const todayKey = (now = dayjs()) => now.format('YYYY-MM-DD')

/** Ordine della lista "Da fare": priorità, poi scadenza più vicina, poi creazione. */
export function compareTodo(a: Item, b: Item): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    a.createdAt.localeCompare(b.createdAt)
  )
}

/** Ordine di Completati/Cestino: il più recente in alto. */
export function compareRecent(a: Item, b: Item): number {
  const ka = a.completedAt ?? a.trashedAt ?? a.createdAt
  const kb = b.completedAt ?? b.trashedAt ?? b.createdAt
  return kb.localeCompare(ka)
}

export function sortForBucket(items: Item[], bucket: Bucket): Item[] {
  return [...items].sort(bucket === 'todo' ? compareTodo : compareRecent)
}

export type DueState = 'none' | 'overdue' | 'soon' | 'later'

/** Stato di una scadenza rispetto a oggi: scaduta, entro `soonDays` giorni, oltre. */
export function dueState(dueDate: string | null | undefined, soonDays = 3, now = dayjs()): DueState {
  if (!dueDate) return 'none'
  if (dueDate < todayKey(now)) return 'overdue'
  if (dueDate <= now.add(soonDays, 'day').format('YYYY-MM-DD')) return 'soon'
  return 'later'
}

/** Formato breve della data: "30 nov" nell'anno corrente, "30 nov 2027" altrimenti. */
export function formatDue(dueDate: string, now = dayjs()): string {
  const d = dayjs(dueDate)
  return d.year() === now.year() ? d.format('D MMM') : d.format('D MMM YYYY')
}

export function matchesSearch(item: Item, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.notes.toLowerCase().includes(q)
}

export const isFilterActive = (f: ItemFilter) =>
  !!(f.from || f.to || f.statuses.length || f.priorities.length || f.userId || f.labelId)

/** Applica il filtro: le date agiscono sulla scadenza (chi non ne ha viene escluso). */
export function applyFilter(items: Item[], f: ItemFilter): Item[] {
  if (!isFilterActive(f)) return items
  return items.filter((i) => {
    if ((f.from || f.to) && !i.dueDate) return false
    if (f.from && i.dueDate! < f.from) return false
    if (f.to && i.dueDate! > f.to) return false
    if (f.statuses.length && !f.statuses.includes(i.status)) return false
    if (f.priorities.length && !f.priorities.includes(i.priority)) return false
    if (f.userId && i.createdBy !== f.userId && i.assigneeId !== f.userId) return false
    if (f.labelId && i.labelId !== f.labelId) return false
    return true
  })
}

/** Prima riga del titolo, per le liste a riga singola. */
export const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? ''

export function countByBucket(items: Item[]): Record<Bucket, number> {
  const c: Record<Bucket, number> = { todo: 0, done: 0, trash: 0 }
  for (const i of items) c[i.bucket]++
  return c
}

export const openQuestions = (item: Item) => item.questions.filter((q) => !q.resolved)

/** Elementi "da tenere d'occhio": immediati o in scadenza entro `days` giorni. */
export function spotlight(projects: Project[], days = 7, now = dayjs()) {
  const limit = now.add(days, 'day').format('YYYY-MM-DD')
  return projects
    .flatMap((p) => p.items.filter((i) => i.bucket === 'todo').map((item) => ({ project: p, item })))
    .filter(({ item }) => item.priority === 'immediata' || (item.dueDate !== null && item.dueDate <= limit))
    .sort((a, b) => compareTodo(a.item, b.item))
}
