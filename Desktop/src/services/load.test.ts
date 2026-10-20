import { describe, expect, it } from 'vitest'
import { absenceOn, absentWorkdays, loadGrid, mondayOf, suggestAssignees, weekStarts } from './load'
import { ItemSchema, type Item } from '@/types'

const T = '2026-10-01T10:00:00.000Z'
let n = 0
const item = (over: Record<string, unknown>): Item => ItemSchema.parse({ id: `i${++n}`, title: `T${n}`, createdAt: T, createdBy: 'u1', status: 'confermato', ...over })
const today = '2026-10-21' // mercoledì

describe('settimane e assenze', () => {
  it('lunedì della settimana e settimane a seguire', () => {
    expect(mondayOf('2026-10-21')).toBe('2026-10-19')
    expect(mondayOf('2026-10-25')).toBe('2026-10-19') // domenica
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
    expect(weekStarts(today, 3)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
  })
  it('giorni lavorativi di assenza (sabato e domenica non contano)', () => {
    const abs = [{ from: '2026-10-23', to: '2026-10-27' }] // ven → mar
    expect(absentWorkdays(abs, '2026-10-19', '2026-10-25')).toBe(1)
    expect(absentWorkdays(abs, '2026-10-26', '2026-11-01')).toBe(2)
    expect(absenceOn(abs, '2026-10-24')).not.toBeNull()
    expect(absenceOn(abs, '2026-10-28')).toBeNull()
  })
})

describe('loadGrid', () => {
  const users = [
    { id: 'mario', weeklyHours: 20, absences: [{ id: 'a', from: '2026-10-26', to: '2026-10-30', note: 'ferie' }] },
    { id: 'anna', weeklyHours: 0, absences: [] },
    { id: 'luca', weeklyHours: 40, absences: [] },
  ]
  const projects = [
    {
      id: 'p1',
      name: 'Sito',
      trashedAt: null,
      items: [
        item({ assigneeId: 'mario', dueDate: '2026-10-22', estimateHours: 12 }),
        item({ assigneeId: 'mario', dueDate: '2026-10-28', estimateHours: 2 }), // durante le ferie
        item({ assigneeId: 'anna', dueDate: '2026-10-20' }), // in ritardo
        item({ assigneeId: null, dueDate: '2026-10-23' }),
        item({ assigneeId: 'anna', dueDate: '2026-10-22', bucket: 'done' }),
        item({ assigneeId: 'anna', dueDate: '2027-01-10' }), // oltre il periodo
      ],
    },
    {
      id: 'p2',
      name: 'App',
      trashedAt: null,
      items: [
        item({ assigneeId: 'mario', dueDate: '2026-10-23', estimateHours: 10 }),
        ...Array.from({ length: 6 }, () => item({ assigneeId: 'anna', dueDate: '2026-10-29' })),
      ],
    },
  ]

  it('scadenze, ore, capacità tolte le assenze, livelli e collisioni tra progetti', () => {
    const g = loadGrid(projects, users, today, 3)
    expect(g.map((r) => r.userId)).toEqual(['mario', 'anna', 'luca', null])
    const [mario, anna, luca, none] = g
    // settimana del 19: 12 + 10 ore su 20 disponibili, due progetti
    expect(mario!.weeks[0]).toMatchObject({ hours: 22, capacity: 20, level: 'over', projects: 2 })
    // settimana del 26: in ferie tutta la settimana, capacità 0, il task scade durante l'assenza
    expect(mario!.weeks[1]).toMatchObject({ absentDays: 5, capacity: 0, level: 'over' })
    expect(mario!.weeks[1]!.inAbsence).toHaveLength(1)
    // senza ore indicate si contano i task: 6 scadenze sono troppe
    expect(anna!.weeks[1]).toMatchObject({ capacity: null, level: 'over' })
    expect(anna!.overdue).toHaveLength(1)
    expect(luca!.weeks.every((w) => w.level === 'none')).toBe(true)
    expect(none!.weeks[0]!.tasks).toHaveLength(1)
  })

  it('a chi passare: non assente quel giorno, con più ore libere', () => {
    const g = loadGrid(projects, users, today, 3)
    const holidayTask = projects[0]!.items[1]!
    expect(suggestAssignees(holidayTask, g, users)).toEqual(['luca', 'anna'])
    expect(suggestAssignees({ dueDate: null, assigneeId: null }, g, users)).toEqual([])
  })
})
