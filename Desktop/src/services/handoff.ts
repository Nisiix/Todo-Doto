/**
 * Nota di passaggio di consegne: quando un task passa a un'altra persona, un
 * riassunto per chi lo riceve, da rivedere e aggiungere come commento.
 * Deterministica (funziona senza IA); con l'IA locale si può riscrivere in
 * forma discorsiva partendo dagli stessi fatti. Funzioni pure.
 */
import dayjs from 'dayjs'
import type { Item } from '@/types'
import type { TaskCommit } from './gitLink'
import { firstLine } from './items'
import { taskCode } from './gitLink'
import { DATE, defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    head: (to: string, from: string) => `@${to} passaggio di consegne da ${from}:`,
    state: (status: string, due: string | null) => `Stato: ${status}${due ? `, scadenza ${due}` : ''}.`,
    checklist: (d: number, t: number) => `Lista di controllo: ${d} di ${t} ${plural(t, 'voce fatta', 'voci fatte')}.`,
    todoItems: (list: string) => `Restano: ${list}.`,
    blocked: (list: string) => `Aspetta ancora: ${list}.`,
    questions: (n: number) => `${n} ${plural(n, 'domanda aperta', 'domande aperte')}:`,
    lastComments: 'Ultimi commenti:',
    commits: (n: number, last: string) => `${n} ${plural(n, 'commit lo cita', 'commit lo citano')}, l’ultimo: ${last}.`,
    nothing: 'Nessun lavoro registrato finora: si parte da zero.',
  },
  en: {
    head: (to: string, from: string) => `@${to} handover from ${from}:`,
    state: (status: string, due: string | null) => `Status: ${status}${due ? `, due ${due}` : ''}.`,
    checklist: (d: number, t: number) => `Checklist: ${d} of ${t} ${plural(t, 'item done', 'items done')}.`,
    todoItems: (list: string) => `Still to do: ${list}.`,
    blocked: (list: string) => `Still waiting for: ${list}.`,
    questions: (n: number) => `${n} open ${plural(n, 'question', 'questions')}:`,
    lastComments: 'Latest comments:',
    commits: (n: number, last: string) => `${n} ${plural(n, 'commit cites', 'commits cite')} it, the latest: ${last}.`,
    nothing: 'No work recorded so far: starting from scratch.',
  },
})

export interface HandoffInput {
  item: Item
  fromName: string
  toName: string
  /** Task da finire prima ancora aperti (titolo con codice). */
  openBlockers: string[]
  commits: TaskCommit[]
  userName: (id: string) => string
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function handoffNote(x: HandoffInput): string {
  const i = x.item
  const L = [m.head(x.toName, x.fromName), m.state(common.status[i.status], i.dueDate ? dayjs(i.dueDate).format(DATE.date) : null)]
  let work = false
  if (i.checklist.length) {
    work = true
    const done = i.checklist.filter((c) => c.done).length
    L.push(m.checklist(done, i.checklist.length))
    const rest = i.checklist.filter((c) => !c.done).map((c) => c.text)
    if (rest.length) L.push(m.todoItems(rest.slice(0, 5).join('; ')))
  }
  if (x.openBlockers.length) L.push(m.blocked(x.openBlockers.join(', ')))
  const open = i.questions.filter((q) => !q.resolved)
  if (open.length) {
    L.push(m.questions(open.length), ...open.slice(0, 3).map((q) => `- ${clip(q.text.trim(), 160)}`))
  }
  const comments = i.comments.slice(-2)
  if (comments.length) {
    work = true
    L.push(m.lastComments, ...comments.map((c) => `- ${x.userName(c.authorId)}: ${clip(c.text.trim(), 160)}`))
  }
  const cs = x.commits.filter((c) => !c.closes)
  if (cs.length) {
    work = true
    L.push(m.commits(cs.length, `${cs[0]!.commit.hash.slice(0, 7)} ${clip(firstLine(cs[0]!.commit.message), 80)}`))
  }
  if (!work) L.push(m.nothing)
  return L.join('\n')
}

/** Fatti essenziali del task, per l'IA locale (testo semplice, già tagliato). */
export const handoffFacts = (x: HandoffInput) => ({
  task: `${x.item.seq ? `${taskCode(x.item.seq)} ` : ''}${firstLine(x.item.title)}`,
  notes: clip(x.item.notes.trim(), 800),
  note: handoffNote(x),
})
