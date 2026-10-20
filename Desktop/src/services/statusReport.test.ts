import { describe, expect, it } from 'vitest'
import { buildReportHtml, reportFacts, reportMarkdown, toWeekFacts } from './statusReport'
import { ItemSchema, ProjectSchema, type Item } from '@/types'

const today = '2026-10-20'
let n = 0
const item = (over: Record<string, unknown>): Item => ItemSchema.parse({ id: `i${++n}`, title: `T${n}`, createdAt: '2026-09-01T10:00:00Z', createdBy: 'u1', seq: n, ...over })
const project = ProjectSchema.parse({
  id: 'p',
  name: 'Portale <clienti>',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'u1',
  milestones: [{ id: 'm1', name: 'v1', dueDate: '2026-10-10', createdAt: '' }],
  items: [
    item({ title: 'Login', bucket: 'done', completedAt: '2026-10-15T10:00:00Z', assigneeId: 'u2', milestoneId: 'm1' }),
    item({ title: 'Vecchio', bucket: 'done', completedAt: '2026-09-15T10:00:00Z' }),
    item({ title: 'Export', status: 'confermato', dueDate: '2026-10-18', milestoneId: 'm1', createdAt: '2026-10-14T10:00:00Z' }),
    item({ title: 'Report', status: 'confermato', dueDate: '2026-10-25' }),
    item({
      title: 'Database',
      questions: [
        {
          id: 'q1', authorId: 'u1', text: 'Quale database?', createdAt: '2026-10-12T10:00:00Z', resolved: true,
          answers: [{ id: 'a1', authorId: 'u2', text: 'PostgreSQL', createdAt: '2026-10-13T10:00:00Z' }],
          decision: { answerId: 'a1', rationale: 'già in uso', at: '2026-10-16T10:00:00Z', by: 'u1' },
        },
        { id: 'q2', authorId: 'u1', text: 'Chi lo installa?', createdAt: '2026-10-10T12:00:00Z' },
      ],
    }),
  ],
})

describe('rapporto di stato', () => {
  const f = reportFacts(project, '2026-10-13', '2026-10-19', today)

  it('fatti del periodo', () => {
    expect(f.completed.map((i) => i.title)).toEqual(['Login'])
    expect(f.created.map((i) => i.title)).toEqual(['Export'])
    expect(f.overdue.map((i) => i.title)).toEqual(['Export'])
    expect(f.upcoming.map((i) => i.title)).toEqual(['Report'])
    expect(f.milestones[0]).toMatchObject({ name: 'v1', progress: { done: 1, total: 2, late: true } })
    expect(f.decisions.map((d) => d.answer.text)).toEqual(['PostgreSQL'])
    expect(f.questions.map((q) => [q.question.text, q.days])).toEqual([['Chi lo installa?', 10]])
    expect(f.signals.find((s) => s.kind === 'overdue')?.n).toBe(1)
  })

  it('Markdown con le sezioni non vuote', () => {
    const md = reportMarkdown(f, { userName: (id) => (id === 'u2' ? 'Anna' : '—') }, 'Settimana tranquilla.')
    expect(md).toContain('# Rapporto di stato · Portale <clienti>')
    expect(md).toContain('Settimana tranquilla.')
    expect(md).toContain('1 completato e 1 nuovo nel periodo · 1 in ritardo adesso')
    expect(md).toContain('- TODO-1 Login (Anna)')
    expect(md).toContain('## In ritardo')
    expect(md).toContain('**Quale database?** → PostgreSQL (Perché: già in uso)')
    expect(md).toContain('v1: 1 di 2 completati · entro il 10 ott · in ritardo')
  })

  it('HTML autonomo, con il testo protetto', () => {
    const html = buildReportHtml(f, { userName: () => 'Anna' })
    expect(html).toContain('Portale &lt;clienti&gt;')
    expect(html).not.toContain('<script')
    expect(html).toContain('class="bad"')
  })

  it('fatti per il riepilogo con l’IA', () => {
    expect(toWeekFacts(f)).toMatchObject({ completed: [{ title: 'Login' }], overdue: [{ title: 'Export', due: '2026-10-18' }] })
  })
})
