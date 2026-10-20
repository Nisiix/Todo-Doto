/**
 * Vista «Oggi»: tutto ciò che riguarda me, in tutti i progetti visibili, nel
 * posto in cui si apre al mattino. Ogni task compare una volta sola, nella
 * prima sezione che lo riguarda:
 *
 *  1. in ritardo          (scadenza passata)
 *  2. oggi                (scade oggi)
 *  3. da rispondere       (domande aperte in cui sono menzionato, o sui miei task, senza risposta)
 *  4. risposte per me     (le mie domande hanno ricevuto risposta: da chiudere o decidere)
 *  5. urgenti             (priorità immediata, senza scadenza vicina)
 *  6. questa settimana    (scade nei prossimi 7 giorni)
 *
 * «Miei» sono i task assegnati a me e quelli non assegnati creati da me; in un
 * workspace locale tutti. Un task rinviato (scelta personale) sparisce fino al
 * giorno indicato senza cambiare la scadenza condivisa. Funzioni pure.
 */
import dayjs from 'dayjs'
import { PRIORITY_RANK, type Item, type Project, type Question } from '@/types'

export const TODAY_SECTIONS = ['overdue', 'today', 'toAnswer', 'answered', 'urgent', 'week'] as const
export type TodaySection = (typeof TODAY_SECTIONS)[number]

export interface TodayEntry {
  project: Project
  item: Item
  section: TodaySection
  /** Domanda che porta il task in «da rispondere» o «risposte per me». */
  question?: Question
}

export interface TodayOptions {
  meId: string
  today: string
  /** Workspace locale: tutti i task sono miei. */
  local?: boolean
  /** Rinvii: id del task → giorno in cui ricompare. */
  snoozed?: Record<string, string>
}

export interface MyDay {
  sections: Record<TodaySection, TodayEntry[]>
  /** Task rinviati ancora nascosti, con il giorno in cui ricompaiono. */
  snoozed: { project: Project; item: Item; until: string }[]
  /** Quanti richiedono attenzione oggi (in ritardo + oggi + da rispondere): il numero nella barra laterale. */
  badge: number
}

export const isMine = (i: Item, o: Pick<TodayOptions, 'meId' | 'local'>) => !!o.local || i.assigneeId === o.meId || (!i.assigneeId && i.createdBy === o.meId)

export function myDay(projects: Project[], o: TodayOptions): MyDay {
  const weekEnd = dayjs(o.today).add(7, 'day').format('YYYY-MM-DD')
  const sections = Object.fromEntries(TODAY_SECTIONS.map((s) => [s, []])) as unknown as Record<TodaySection, TodayEntry[]>
  const snoozed: MyDay['snoozed'] = []
  for (const project of projects) {
    if (project.trashedAt) continue
    for (const item of project.items) {
      if (item.bucket !== 'todo') continue
      const mine = isMine(item, o)
      const open = item.questions.filter((q) => !q.resolved)
      const toAnswer = open.find((q) => q.authorId !== o.meId && !q.answers.length && (q.mentions.includes(o.meId) || (mine && !o.local)))
      const answered = open.find((q) => q.authorId === o.meId && q.answers.some((a) => a.authorId !== o.meId) && q.answers.at(-1)?.authorId !== o.meId)
      let section: TodaySection | null = null
      let question: Question | undefined
      const due = item.dueDate
      if (mine && due && due < o.today) section = 'overdue'
      else if (mine && due === o.today) section = 'today'
      else if (toAnswer) [section, question] = ['toAnswer', toAnswer]
      else if (answered) [section, question] = ['answered', answered]
      else if (mine && item.priority === 'immediata') section = 'urgent'
      else if (mine && due && due <= weekEnd) section = 'week'
      if (!section) continue
      const until = o.snoozed?.[item.id]
      if (until && until > o.today) {
        snoozed.push({ project, item, until })
        continue
      }
      sections[section].push({ project, item, section, question })
    }
  }
  const byDueThenPriority = (a: TodayEntry, b: TodayEntry) =>
    (a.item.dueDate ?? '9999').localeCompare(b.item.dueDate ?? '9999') || PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority]
  for (const s of TODAY_SECTIONS) sections[s].sort(byDueThenPriority)
  snoozed.sort((a, b) => a.until.localeCompare(b.until))
  return { sections, snoozed, badge: sections.overdue.length + sections.today.length + sections.toAnswer.length }
}

/** Giorni proposti per il rinvio: domani, il prossimo lunedì, tra una settimana. */
export function snoozeOptions(today: string): { key: 'tomorrow' | 'monday' | 'week'; date: string }[] {
  const t = dayjs(today)
  const monday = t.add(((1 - t.day() + 7) % 7) || 7, 'day')
  return [
    { key: 'tomorrow', date: t.add(1, 'day').format('YYYY-MM-DD') },
    { key: 'monday', date: monday.format('YYYY-MM-DD') },
    { key: 'week', date: t.add(7, 'day').format('YYYY-MM-DD') },
  ]
}
