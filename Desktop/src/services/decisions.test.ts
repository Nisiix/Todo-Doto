import { describe, expect, it } from 'vitest'
import { decisionsMarkdown, filterDecisions, projectDecisions } from './decisions'
import { ItemSchema } from '@/types'

const T = (d: number) => `2026-10-${String(d).padStart(2, '0')}T10:00:00.000Z`
const q = (id: string, decided: { answer: string; rationale?: string; day: number } | null, answers: string[]) => ({
  id,
  authorId: 'u1',
  text: `Domanda ${id}?`,
  createdAt: T(1),
  resolved: !!decided,
  answers: answers.map((text, i) => ({ id: `${id}-a${i}`, authorId: 'u2', text, createdAt: T(2) })),
  decision: decided ? { answerId: `${id}-a${answers.indexOf(decided.answer)}`, rationale: decided.rationale ?? '', at: T(decided.day), by: 'u1' } : null,
})
const item = (id: string, bucket: 'todo' | 'done' | 'trash', questions: ReturnType<typeof q>[]) =>
  ItemSchema.parse({ id, title: `Task ${id}`, createdAt: T(1), createdBy: 'u1', bucket, questions })

const project = {
  items: [
    item('i1', 'todo', [q('q1', { answer: 'PostgreSQL', rationale: 'già in uso dal cliente', day: 5 }, ['MySQL', 'PostgreSQL']), q('q2', null, ['forse'])]),
    item('i2', 'done', [q('q3', { answer: 'Sì', day: 9 }, ['Sì'])]),
    item('i3', 'trash', [q('q4', { answer: 'No', day: 12 }, ['No'])]),
  ],
}

describe('registro delle decisioni', () => {
  it('solo le domande con una decisione, dalla più recente, senza il cestino', () => {
    const d = projectDecisions(project)
    expect(d.map((e) => e.question.id)).toEqual(['q3', 'q1'])
    expect(d[1]!.answer.text).toBe('PostgreSQL')
    expect(projectDecisions(project, { includeTrash: true }).map((e) => e.question.id)).toEqual(['q4', 'q3', 'q1'])
  })

  it('una decisione che punta a una risposta eliminata non compare', () => {
    const p = { items: [item('i9', 'todo', [{ ...q('q9', { answer: 'x', day: 3 }, ['x']), answers: [] }])] }
    expect(projectDecisions(p)).toEqual([])
  })

  it('ricerca su domanda, risposta, motivazione e titolo, senza accenti', () => {
    const d = projectDecisions(project)
    expect(filterDecisions(d, 'postgresql').map((e) => e.question.id)).toEqual(['q1'])
    expect(filterDecisions(d, 'CLIENTE già').map((e) => e.question.id)).toEqual(['q1'])
    expect(filterDecisions(d, 'task i2').map((e) => e.question.id)).toEqual(['q3'])
    expect(filterDecisions(d, '  ')).toHaveLength(2)
  })

  it('Markdown con data, codice, domanda, decisione e motivazione', () => {
    const md = decisionsMarkdown(projectDecisions(project), {
      title: 'Decisioni',
      userName: () => 'Mario',
      formatDate: (iso) => iso.slice(0, 10),
      code: (i) => `${i.title}`,
      why: 'Perché',
    })
    expect(md).toContain('## Decisioni')
    expect(md).toContain('### 2026-10-05 · Task i1')
    expect(md).toContain('**Domanda q1?**')
    expect(md).toContain('→ PostgreSQL')
    expect(md).toContain('Perché: già in uso dal cliente')
    expect(md.indexOf('Task i2')).toBeLessThan(md.indexOf('Task i1'))
  })
})
