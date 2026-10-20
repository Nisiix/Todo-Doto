import { describe, expect, it } from 'vitest'
import { cycleStats, lastActivity, median, projectSignals } from './insights'
import { ItemSchema, type Item } from '@/types'

const NOW = '2026-10-20T12:00:00.000Z'
const ago = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString()
let n = 0
const item = (over: Record<string, unknown>): Item => ItemSchema.parse({ id: `i${++n}`, title: `T${n}`, createdAt: ago(1), createdBy: 'u1', ...over })

describe('median', () => {
  it('pari, dispari e troppo pochi valori', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 10])).toBe(2.5)
    expect(median([1, 2])).toBeNull()
    expect(median([4], 1)).toBe(4)
  })
})

describe('cycleStats', () => {
  it('mediane sui completati recenti ed età dei task da fare per stato', () => {
    const items = [
      // completati negli ultimi 90 giorni: creato → confermato 2, 4, 6 giorni; confermato → completato 1, 3, 5
      item({ createdAt: ago(20), confirmedAt: ago(18), completedAt: ago(17), bucket: 'done', status: 'confermato' }),
      item({ createdAt: ago(30), confirmedAt: ago(26), completedAt: ago(23), bucket: 'done', status: 'confermato' }),
      item({ createdAt: ago(40), confirmedAt: ago(34), completedAt: ago(29), bucket: 'done', status: 'confermato' }),
      // completato troppo tempo fa: escluso
      item({ createdAt: ago(300), confirmedAt: ago(299), completedAt: ago(200), bucket: 'done' }),
      // da fare
      item({ createdAt: ago(2), status: 'da_valutare' }),
      item({ createdAt: ago(10), status: 'confermato' }),
      item({ createdAt: ago(45), status: 'da_definire' }),
      item({ createdAt: ago(120), status: 'da_valutare' }),
      // nel cestino: ignorato
      item({ createdAt: ago(500), bucket: 'trash' }),
    ]
    const s = cycleStats(items, NOW)
    expect(s.sample).toBe(3)
    expect(s.toConfirm).toBe(4)
    expect(s.confirmToDone).toBe(3)
    expect(s.leadTime).toBe(7)
    expect(s.aging.week.da_valutare).toBe(1)
    expect(s.aging.month.confermato).toBe(1)
    expect(s.aging.quarter.da_definire).toBe(1)
    expect(s.aging.older.da_valutare).toBe(1)
    expect(s.openAge).toBe(27.5)
  })

  it('progetto senza storia: niente mediane', () => {
    const s = cycleStats([item({})], NOW)
    expect(s).toMatchObject({ sample: 0, toConfirm: null, confirmToDone: null, leadTime: null })
  })
})

describe('projectSignals', () => {
  const q = (createdAt: string, answers = 0, resolved = false) => ({
    id: `q${++n}`,
    authorId: 'u1',
    text: '?',
    createdAt,
    resolved,
    answers: Array.from({ length: answers }, (_, k) => ({ id: `a${n}-${k}`, authorId: 'u2', text: 'r', createdAt }))
  })

  it('ogni tipo di segnale, dal più grave', () => {
    const items = [
      item({ title: 'fermo', createdAt: ago(30), updatedAt: ago(25) }),
      item({ title: 'in ritardo', status: 'confermato', dueDate: '2026-10-15', confirmedAt: ago(10) }),
      item({ title: 'urgente', priority: 'immediata' }),
      item({ title: 'domanda', questions: [q(ago(4))] }),
      item({ title: 'domanda vecchia', questions: [q(ago(9))] }),
      item({ title: 'domanda con risposta', questions: [q(ago(9), 1)] }),
      item({ title: 'confermato senza data', status: 'confermato', confirmedAt: ago(2), assigneeId: 'u1' }),
      item({ title: 'utente rimosso', assigneeId: 'u-gone' }),
      item({ title: 'durante le ferie', assigneeId: 'u2', status: 'confermato', dueDate: '2026-10-28', confirmedAt: ago(1) }),
      item({ title: 'completato in ritardo', bucket: 'done', dueDate: '2026-10-01', status: 'confermato' }),
    ]
    const s = projectSignals({ items }, { now: NOW, userIds: ['u1', 'u2'], absences: { u2: [{ from: '2026-10-26', to: '2026-10-30' }] } })
    const byTitle = Object.fromEntries(s.map((x) => [x.item.title, x]))
    expect(byTitle['in ritardo']).toMatchObject({ kind: 'overdue', severity: 'high', days: 5 })
    expect(byTitle['urgente']).toMatchObject({ kind: 'urgent_unassigned', severity: 'high' })
    expect(byTitle['domanda']).toMatchObject({ kind: 'unanswered', severity: 'medium', days: 4 })
    expect(byTitle['domanda vecchia']).toMatchObject({ kind: 'unanswered', severity: 'high', days: 9 })
    expect(byTitle['confermato senza data']).toMatchObject({ kind: 'confirmed_no_due', severity: 'low' })
    expect(byTitle['utente rimosso']).toMatchObject({ kind: 'removed_assignee', severity: 'medium' })
    expect(byTitle['durante le ferie']).toMatchObject({ kind: 'due_in_absence', severity: 'medium', days: 8 })
    expect(byTitle['fermo']).toMatchObject({ kind: 'stale', severity: 'low', days: 25 })
    expect(byTitle['domanda con risposta']).toBeUndefined()
    expect(byTitle['completato in ritardo']).toBeUndefined()
    // ordine: prima i gravi (urgente prima per priorità), poi medi, poi bassi
    expect(s.map((x) => x.severity)).toEqual(['high', 'high', 'high', 'medium', 'medium', 'medium', 'low', 'low'])
    expect(s[0]!.item.title).toBe('urgente')
  })

  it('un solo segnale per task: il più grave', () => {
    const it = item({ priority: 'immediata', createdAt: ago(40), updatedAt: ago(40) })
    const s = projectSignals({ items: [it] }, { now: NOW })
    expect(s).toHaveLength(1)
    expect(s[0]!.kind).toBe('urgent_unassigned')
  })

  it('un commento recente toglie il task dai fermi', () => {
    const it = item({ createdAt: ago(60), updatedAt: ago(60), comments: [{ id: 'c', authorId: 'u1', text: 'ok', createdAt: ago(1) }] })
    expect(lastActivity(it)).toBe(ago(1))
    expect(projectSignals({ items: [it] }, { now: NOW })).toEqual([])
  })
})
