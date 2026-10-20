/**
 * Dati del Gantt di un progetto: solo i task Confermati con una scadenza,
 * raggruppati per etichetta o per priorità. La barra va da quando il task è
 * diventato Confermato (per i task di prima, dalla creazione) alla scadenza;
 * se la scadenza è precedente, è una tappa (un solo giorno).
 */
import dayjs from 'dayjs'
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_RANK, type Item, type Label, type Priority } from '@/types'
import { compareText } from '@/i18n'

export type GanttGroupBy = 'label' | 'priority'

export interface GanttBar {
  item: Item
  /** Primo e ultimo giorno della barra (YYYY-MM-DD, inclusi). */
  start: string
  end: string
  /** Scadenza passata e task ancora da fare. */
  overdue: boolean
  /** Inizio e fine coincidono (scadenza prima della conferma, o nello stesso giorno). */
  milestone: boolean
}

export interface GanttGroup {
  key: string
  title: string
  /** Colore del gruppo (etichetta) o classe della priorità. */
  color: string | null
  priority: Priority | null
  bars: GanttBar[]
}

const day = (iso: string) => dayjs(iso).format('YYYY-MM-DD')

/** I task che entrano nel Gantt: Confermati, con scadenza, non nel cestino (i completati solo se richiesti). */
export function ganttItems(items: Item[], opts: { includeDone?: boolean } = {}): Item[] {
  return items.filter((i) => i.status === 'confermato' && !!i.dueDate && i.bucket !== 'trash' && (opts.includeDone || i.bucket === 'todo'))
}

export function toBar(item: Item, today = dayjs()): GanttBar {
  const end = item.dueDate!
  const from = day(item.confirmedAt ?? item.createdAt)
  const start = from > end ? end : from
  return { item, start, end, milestone: start === end, overdue: item.bucket === 'todo' && dayjs(end).isBefore(today, 'day') }
}

const byPriorityThenDue = (a: GanttBar, b: GanttBar) =>
  PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] || a.end.localeCompare(b.end) || compareText(a.item.title, b.item.title)

/** Gruppi del Gantt: per etichetta (nell'ordine delle etichette, "Senza etichetta" in fondo) o per priorità. */
export function ganttGroups(
  items: Item[],
  groupBy: GanttGroupBy,
  labels: Label[],
  texts: { noLabel: string },
  opts: { includeDone?: boolean; today?: dayjs.Dayjs } = {},
): GanttGroup[] {
  const bars = ganttItems(items, opts).map((i) => toBar(i, opts.today))
  if (groupBy === 'priority') {
    return [...PRIORITIES]
      .sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])
      .map((p) => ({
        key: p,
        title: PRIORITY_LABEL[p],
        color: null,
        priority: p,
        bars: bars.filter((b) => b.item.priority === p).sort((a, b) => a.end.localeCompare(b.end) || compareText(a.item.title, b.item.title)),
      }))
      .filter((g) => g.bars.length)
  }
  const groups: GanttGroup[] = labels.map((l) => ({ key: l.id, title: l.name, color: l.color, priority: null, bars: [] }))
  const none: GanttGroup = { key: '', title: texts.noLabel, color: null, priority: null, bars: [] }
  for (const b of bars) (groups.find((g) => g.key === b.item.labelId) ?? none).bars.push(b)
  return [...groups, none].map((g) => ({ ...g, bars: g.bars.sort(byPriorityThenDue) })).filter((g) => g.bars.length)
}

/** Giorni mostrati: da poco prima del primo inizio a poco dopo l'ultima scadenza, oggi compreso. */
/** Periodo mostrato: da tutte le barre a oggi, più le date in `extra` (es. le tappe aperte), con un margine. */
export function ganttRange(groups: GanttGroup[], today = dayjs(), pad = 3, extra: string[] = []): { from: dayjs.Dayjs; days: number } {
  const all = groups.flatMap((g) => g.bars)
  let from = today.startOf('day')
  let to = today.startOf('day')
  for (const b of all) {
    if (dayjs(b.start).isBefore(from)) from = dayjs(b.start)
    if (dayjs(b.end).isAfter(to)) to = dayjs(b.end)
  }
  for (const d of extra) {
    if (dayjs(d).isBefore(from)) from = dayjs(d)
    if (dayjs(d).isAfter(to)) to = dayjs(d)
  }
  from = from.subtract(pad, 'day')
  to = to.add(pad, 'day')
  return { from, days: to.diff(from, 'day') + 1 }
}
