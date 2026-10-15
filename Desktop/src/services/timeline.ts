/**
 * Timeline delle scadenze: gli elementi da fare di tutti i progetti visibili
 * distribuiti per settimana. Funzioni pure, testate in timeline.test.ts.
 */
import dayjs, { type Dayjs } from 'dayjs'
import { compareTodo } from './items'
import type { Item, Project } from '@/types'
import { t } from '@/i18n'

export interface TimelineEntry {
  project: Project
  item: Item
}

export interface TimelineColumn {
  id: string
  label: string
  /** Sottotitolo (intervallo di date). */
  hint: string
  kind: 'overdue' | 'week' | 'later' | 'none'
  entries: TimelineEntry[]
}

/** Lunedì della settimana che contiene `d`. */
export function weekStart(d: Dayjs): Dayjs {
  const dow = (d.day() + 6) % 7 // 0 = lunedì
  return d.subtract(dow, 'day').startOf('day')
}

export function buildTimeline(projects: Project[], weeks = 8, now = dayjs()): TimelineColumn[] {
  const today = now.format('YYYY-MM-DD')
  const entries: TimelineEntry[] = projects.flatMap((p) => p.items.filter((i) => i.bucket === 'todo').map((item) => ({ project: p, item })))
  const sort = (a: TimelineEntry, b: TimelineEntry) => compareTodo(a.item, b.item)

  const cols: TimelineColumn[] = []
  cols.push({ id: 'overdue', label: t('Scadute'), hint: t('prima di oggi'), kind: 'overdue', entries: entries.filter((e) => e.item.dueDate && e.item.dueDate < today).sort(sort) })
  const start = weekStart(now)
  for (let w = 0; w < weeks; w++) {
    const from = start.add(w, 'week')
    const to = from.add(6, 'day')
    const fromKey = w === 0 ? today : from.format('YYYY-MM-DD')
    const toKey = to.format('YYYY-MM-DD')
    cols.push({
      id: `w${w}`,
      label: w === 0 ? t('Questa settimana') : w === 1 ? t('Prossima settimana') : t('Settimana {n}', { n: from.isoWeekLike() }),
      hint: `${from.format('D MMM')} – ${to.format('D MMM')}`,
      kind: 'week',
      entries: entries.filter((e) => e.item.dueDate && e.item.dueDate >= fromKey && e.item.dueDate <= toKey).sort(sort),
    })
  }
  const horizon = start.add(weeks, 'week').format('YYYY-MM-DD')
  cols.push({ id: 'later', label: t('Più avanti'), hint: t('dal {date}', { date: dayjs(horizon).format('D MMM') }), kind: 'later', entries: entries.filter((e) => e.item.dueDate && e.item.dueDate >= horizon).sort(sort) })
  cols.push({ id: 'none', label: t('Senza scadenza'), hint: '', kind: 'none', entries: entries.filter((e) => !e.item.dueDate).sort(sort) })
  return cols
}

// Numero di settimana ISO senza plugin: dayjs non lo include di default.
declare module 'dayjs' {
  interface Dayjs {
    isoWeekLike(): number
  }
}
dayjs.prototype.isoWeekLike = function (this: Dayjs) {
  const d = this.startOf('day')
  const thursday = weekStart(d).add(3, 'day')
  const firstThursday = weekStart(thursday.startOf('year')).add(3, 'day')
  const first = firstThursday.year() === thursday.year() ? firstThursday : firstThursday.add(1, 'week')
  return Math.floor(thursday.diff(first, 'day') / 7) + 1
}
