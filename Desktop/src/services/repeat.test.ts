import { describe, expect, it } from 'vitest'
import { nextOccurrence } from './repeat'
import { ItemSchema } from '@/types'

const base = { id: 'i', title: 'Rilascio', createdAt: '2026-10-01T00:00:00Z', createdBy: 'u', status: 'confermato', dueDate: '2026-10-31', assigneeId: 'u2', milestoneId: 'm1', estimateHours: 2 }
const checklist = [{ id: 'c1', text: 'Test', done: true }, { id: 'c2', text: 'Tag', done: false }]

describe('ripetizione', () => {
  it('nessuna ripetizione: nulla', () => {
    expect(nextOccurrence(ItemSchema.parse(base))).toBeNull()
  })
  it('ogni mese: scadenza +1 mese (fine mese compresa), lista da rifare, senza tappa', () => {
    const n = nextOccurrence(ItemSchema.parse({ ...base, repeat: 'month', checklist }))!
    expect(n).toMatchObject({ title: 'Rilascio', dueDate: '2026-11-30', assigneeId: 'u2', milestoneId: null, estimateHours: 2, repeat: 'month' })
    expect(n.checklist!.map((c) => [c.text, c.done])).toEqual([['Test', false], ['Tag', false]])
    expect(n.checklist![0]!.id).not.toBe('c1')
  })
  it('ogni settimana; senza scadenza resta senza', () => {
    expect(nextOccurrence(ItemSchema.parse({ ...base, repeat: 'week' }))!.dueDate).toBe('2026-11-07')
    expect(nextOccurrence(ItemSchema.parse({ ...base, repeat: 'week', dueDate: null }))!.dueDate).toBeNull()
  })
})
