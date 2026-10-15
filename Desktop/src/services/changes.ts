/**
 * Confronta due versioni di un progetto e descrive cosa è cambiato, per le
 * notifiche. Funzione pura: nessuna dipendenza da Vue o dallo store.
 */
import { STATUS_LABEL, type Item, type NotificationType, type Project } from '@/types'
import { firstLine } from './items'
import { t } from '@/i18n'

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
  const out: Change[] = []
  const by = next.updatedBy
  const prevItems = new Map(prev.items.map((i) => [i.id, i]))
  const base = (it: Item) => ({ itemId: it.id, itemTitle: firstLine(it.title), byId: by, mentions: [] as string[] })

  for (const it of next.items) {
    const old = prevItems.get(it.id)
    if (!old) {
      if (it.bucket === 'todo') out.push({ ...base(it), type: 'item_created', text: t('ha aggiunto un elemento') })
      continue
    }
    if (old.bucket !== it.bucket) {
      if (it.bucket === 'done') out.push({ ...base(it), type: 'item_completed', text: t('ha completato l’elemento') })
      else if (it.bucket === 'trash') out.push({ ...base(it), type: 'item_trashed', text: t('ha spostato l’elemento nel cestino') })
      else if (old.bucket === 'done') out.push({ ...base(it), type: 'item_completed', text: t('ha riaperto l’elemento') })
      else out.push({ ...base(it), type: 'item_trashed', text: t('ha ripristinato l’elemento dal cestino') })
    }
    if (old.status !== it.status) out.push({ ...base(it), type: 'item_status', text: t('ha cambiato lo stato in «{status}»', { status: t(STATUS_LABEL[it.status]) }) })
    if (old.notes !== it.notes) out.push({ ...base(it), type: 'item_notes', text: t('ha modificato la descrizione') })

    const oldComments = new Set(old.comments.map((c) => c.id))
    for (const c of it.comments)
      if (!oldComments.has(c.id)) out.push({ ...base(it), type: 'comment', byId: c.authorId, text: t('ha commentato: {text}', { text: c.text }), mentions: c.mentions })

    const oldQ = new Map(old.questions.map((q) => [q.id, q]))
    for (const q of it.questions) {
      const oq = oldQ.get(q.id)
      if (!oq) {
        out.push({ ...base(it), type: 'question', byId: q.authorId, text: t('ha chiesto: {text}', { text: q.text }), mentions: q.mentions })
        continue
      }
      const oldA = new Set(oq.answers.map((a) => a.id))
      for (const a of q.answers)
        if (!oldA.has(a.id)) out.push({ ...base(it), type: 'answer', byId: a.authorId, text: t('ha risposto: {text}', { text: a.text }), mentions: a.mentions })
    }
  }
  return out
}
