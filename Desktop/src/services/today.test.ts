import { describe, expect, it } from 'vitest'
import { myDay, snoozeOptions } from './today'
import { ItemSchema, ProjectSchema, type Item, type Project } from '@/types'

const T = '2026-10-15T10:00:00.000Z'
const today = '2026-10-20' // martedì
let n = 0
const item = (over: Record<string, unknown>): Item => ItemSchema.parse({ id: `i${++n}`, title: `T${n}`, createdAt: T, createdBy: 'other', ...over })
const project = (items: Item[], over: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({ id: `p${++n}`, name: 'P', createdAt: T, createdBy: 'me', updatedAt: T, updatedBy: 'me', items, ...over })
const q = (authorId: string, opts: { mentions?: string[]; answers?: string[]; resolved?: boolean } = {}) => ({
  id: `q${++n}`,
  authorId,
  text: '?',
  createdAt: T,
  mentions: opts.mentions ?? [],
  resolved: opts.resolved ?? false,
  answers: (opts.answers ?? []).map((a, k) => ({ id: `a${n}-${k}`, authorId: a, text: 'r', createdAt: T })),
})
const conf = (dueDate: string) => ({ status: 'confermato', dueDate })

describe('myDay', () => {
  const items = {
    overdue: item({ title: 'ritardo', assigneeId: 'me', ...conf('2026-10-18') }),
    today: item({ title: 'oggi', assigneeId: 'me', ...conf('2026-10-20') }),
    week: item({ title: 'settimana', assigneeId: 'me', ...conf('2026-10-25') }),
    later: item({ title: 'più avanti', assigneeId: 'me', ...conf('2026-11-30') }),
    urgent: item({ title: 'urgente', assigneeId: 'me', priority: 'immediata' }),
    mineByCreation: item({ title: 'creato da me', createdBy: 'me', priority: 'immediata' }),
    others: item({ title: 'di altri', assigneeId: 'other', ...conf('2026-10-18') }),
    mention: item({ title: 'menzione', assigneeId: 'other', questions: [q('other', { mentions: ['me'] })] }),
    mentionAnswered: item({ title: 'menzione con risposta', assigneeId: 'other', questions: [q('other', { mentions: ['me'], answers: ['x'] })] }),
    onMine: item({ title: 'domanda sul mio', assigneeId: 'me', questions: [q('other')] }),
    myQuestion: item({ title: 'mia domanda', assigneeId: 'other', questions: [q('me', { answers: ['other'] })] }),
    myQuestionLastMine: item({ title: 'ho già replicato', assigneeId: 'other', questions: [q('me', { answers: ['other', 'me'] })] }),
    done: item({ title: 'completato', assigneeId: 'me', bucket: 'done', ...conf('2026-10-18') }),
  }
  const projects = [project(Object.values(items)), project([item({ title: 'cestinato', assigneeId: 'me', ...conf('2026-10-18') })], { trashedAt: T })]

  it('ogni task nella prima sezione che lo riguarda; solo i miei, niente completati né progetti nel cestino', () => {
    const d = myDay(projects, { meId: 'me', today })
    const titles = (s: keyof typeof d.sections) => d.sections[s].map((e) => e.item.title)
    expect(titles('overdue')).toEqual(['ritardo'])
    expect(titles('today')).toEqual(['oggi'])
    expect(titles('toAnswer')).toEqual(['menzione', 'domanda sul mio'])
    expect(titles('answered')).toEqual(['mia domanda'])
    expect(titles('urgent')).toEqual(['urgente', 'creato da me'])
    expect(titles('week')).toEqual(['settimana'])
    expect(d.badge).toBe(4)
    expect(d.sections.toAnswer[0]!.question?.mentions).toEqual(['me'])
  })

  it('rinviati: spariscono fino al giorno indicato; un rinvio passato non conta più', () => {
    const d = myDay(projects, { meId: 'me', today, snoozed: { [items.overdue.id]: '2026-10-22', [items.today.id]: '2026-10-19' } })
    expect(d.sections.overdue).toEqual([])
    expect(d.sections.today.map((e) => e.item.title)).toEqual(['oggi'])
    expect(d.snoozed.map((s) => [s.item.title, s.until])).toEqual([['ritardo', '2026-10-22']])
    expect(d.badge).toBe(3)
  })

  it('workspace locale: tutti i task sono miei', () => {
    const d = myDay([project([items.others])], { meId: 'me', today, local: true })
    expect(d.sections.overdue.map((e) => e.item.title)).toEqual(['di altri'])
  })
})

describe('snoozeOptions', () => {
  it('domani, il prossimo lunedì, tra una settimana', () => {
    expect(snoozeOptions(today)).toEqual([
      { key: 'tomorrow', date: '2026-10-21' },
      { key: 'monday', date: '2026-10-26' },
      { key: 'week', date: '2026-10-27' },
    ])
    // di lunedì, «lunedì» è quello dopo
    expect(snoozeOptions('2026-10-26')[1]!.date).toBe('2026-11-02')
  })
})
