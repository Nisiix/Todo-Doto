/**
 * Task che si ripetono (es. «Checklist di rilascio» ogni mese): completandone
 * uno nasce il prossimo, con la lista di controllo da rifare e la scadenza
 * spostata di una settimana o di un mese. Funzione pura.
 */
import dayjs from 'dayjs'
import type { Item } from '@/types'
import { newId } from './ids'

export function nextOccurrence(i: Item): (Partial<Item> & { title: string }) | null {
  if (i.repeat === 'none') return null
  const unit = i.repeat === 'week' ? 'week' : 'month'
  return {
    title: i.title,
    notes: i.notes,
    priority: i.priority,
    status: i.status,
    dueDate: i.dueDate ? dayjs(i.dueDate).add(1, unit).format('YYYY-MM-DD') : null,
    labelId: i.labelId,
    assigneeId: i.assigneeId,
    milestoneId: null, // la prossima volta sarà un'altra tappa
    estimateHours: i.estimateHours,
    checklist: i.checklist.map((c) => ({ id: newId('chk'), text: c.text, done: false })),
    repeat: i.repeat,
  }
}
