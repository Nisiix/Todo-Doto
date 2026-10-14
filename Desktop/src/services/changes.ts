/**
 * Confronta due versioni di un progetto e descrive cosa è cambiato, per le
 * notifiche. Funzione pura: nessuna dipendenza da Vue o dallo store.
 */
import { STATUS_LABEL, type Item, type NotificationType, type Project } from '@/types'
import { firstLine } from './items'
import { common } from '@/i18n/common'

export interface Change {
  type: NotificationType
  itemId: string
  itemTitle: string
  byId: string
  text: string
  /** id degli utenti taggati nel testo (per il tipo "mention") */
  mentions: string[]
}

export function diffProjects(prev: Project, next: Project): Change[] {
  const A = common.activity
  const out: Change[] = []
  const by = next.updatedBy
  const prevItems = new Map(prev.items.map((i) => [i.id, i]))
  const base = (it: Item) => ({ itemId: it.id, itemTitle: firstLine(it.title), byId: by, mentions: [] as string[] })

  for (const it of next.items) {
    const old = prevItems.get(it.id)
    if (!old) {
      if (it.bucket === 'todo') out.push({ ...base(it), type: 'item_created', text: A.created })
      continue
    }
    if (old.bucket !== it.bucket) {
      if (it.bucket === 'done') out.push({ ...base(it), type: 'item_completed', text: A.completed })
      else if (it.bucket === 'trash') out.push({ ...base(it), type: 'item_trashed', text: A.trashed })
      else if (old.bucket === 'done') out.push({ ...base(it), type: 'item_completed', text: A.reopened })
      else out.push({ ...base(it), type: 'item_trashed', text: A.restored })
    }
    if (old.status !== it.status) out.push({ ...base(it), type: 'item_status', text: A.status(STATUS_LABEL[it.status]) })
    if (old.notes !== it.notes) out.push({ ...base(it), type: 'item_notes', text: A.notes })
    if (old.assigneeId !== it.assigneeId && it.assigneeId)
      out.push({ ...base(it), type: 'assigned', text: A.assigned, mentions: [it.assigneeId] })

    const oldComments = new Set(old.comments.map((c) => c.id))
    for (const c of it.comments)
      if (!oldComments.has(c.id)) out.push({ ...base(it), type: 'comment', byId: c.authorId, text: A.commented(c.text), mentions: c.mentions })

    const oldQ = new Map(old.questions.map((q) => [q.id, q]))
    for (const q of it.questions) {
      const oq = oldQ.get(q.id)
      if (!oq) {
        out.push({ ...base(it), type: 'question', byId: q.authorId, text: A.asked(q.text), mentions: q.mentions })
        continue
      }
      const oldA = new Set(oq.answers.map((a) => a.id))
      for (const a of q.answers)
        if (!oldA.has(a.id)) out.push({ ...base(it), type: 'answer', byId: a.authorId, text: A.answered(a.text), mentions: a.mentions })
    }
  }
  return out
}
