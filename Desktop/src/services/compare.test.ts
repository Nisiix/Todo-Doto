import { describe, expect, it } from 'vitest'
import { compareStates, defaultFrom } from './compare'
import { ItemSchema, type Item } from '@/types'

const item = (id: string, over: Record<string, unknown> = {}): Item => ItemSchema.parse({ id, title: `Task ${id}\nnote`, seq: Number(id.slice(1)) || 0, createdAt: '2026-10-01T00:00:00Z', createdBy: 'u', ...over })
const proj = (id: string, name: string, items: Item[], trashedAt: string | null = null) => ({ id, name, items, trashedAt })

describe('compareStates', () => {
  const before = [
    proj('p1', 'Sito', [
      item('i1'),
      item('i2', { status: 'confermato', dueDate: '2026-11-01', assigneeId: 'mario' }),
      item('i3', { bucket: 'done' }),
      item('i4'),
      item('i5', { bucket: 'trash' }),
      item('i6'),
      item('i7', { bucket: 'trash' }),
    ]),
    proj('p2', 'App', [item('i1')]),
    proj('p3', 'Vecchio', []),
    proj('p4', 'Uguale', [item('i1')]),
  ]
  const after = [
    proj('p1', 'Sito web', [
      item('i1', { bucket: 'done' }),
      item('i2', { status: 'confermato', dueDate: '2026-11-15', assigneeId: 'anna' }),
      item('i3'),
      item('i4', { bucket: 'trash' }),
      item('i5'),
      // i6 eliminato; i7 eliminato ma era già nel cestino
      item('i8'),
      item('i9', { bucket: 'trash' }), // aggiunto e cestinato nel frattempo: non conta
    ]),
    proj('p2', 'App', [item('i1')], '2026-10-10T00:00:00Z'),
    proj('p5', 'Nuovo', [item('i1')]),
    proj('p4', 'Uguale', [item('i1')]),
  ]
  const c = compareStates(before, after)

  it('modifiche dei task, con scadenza e assegnatario «da → a»', () => {
    const sito = c.projects.find((p) => p.projectId === 'p1')!
    expect(sito.project).toEqual([{ kind: 'project_renamed', projectId: 'p1', name: 'Sito web', from: 'Sito' }])
    expect(sito.items.map((x) => [x.kind, x.itemId])).toEqual([
      ['completed', 'i1'],
      ['due', 'i2'],
      ['assignee', 'i2'],
      ['reopened', 'i3'],
      ['trashed', 'i4'],
      ['restored', 'i5'],
      ['added', 'i8'],
      ['deleted', 'i6'],
    ])
    expect(sito.items[1]).toMatchObject({ from: '2026-11-01', to: '2026-11-15', title: 'Task i2', seq: 2 })
    expect(sito.items[2]).toMatchObject({ from: 'mario', to: 'anna' })
  })

  it('progetti nuovi, cestinati ed eliminati; quelli senza modifiche non compaiono', () => {
    expect(c.projects.map((p) => p.name)).toEqual(['App', 'Nuovo', 'Sito web', 'Vecchio'])
    expect(c.projects.find((p) => p.projectId === 'p2')!.project[0]!.kind).toBe('project_trashed')
    expect(c.projects.find((p) => p.projectId === 'p5')).toMatchObject({ project: [{ kind: 'project_added' }], items: [{ kind: 'added' }] })
    expect(c.projects.find((p) => p.projectId === 'p3')!.project[0]!.kind).toBe('project_deleted')
    expect(c.counts).toMatchObject({ added: 2, completed: 1, due: 1, assignee: 1, project_trashed: 1, project_deleted: 1 })
    expect(c.total).toBe(13)
  })

  it('nessuna differenza', () => {
    expect(compareStates(before, before)).toMatchObject({ projects: [], total: 0 })
  })
})

describe('defaultFrom', () => {
  const now = new Date('2026-10-21T12:00:00')
  const at = (d: string) => ({ at: new Date(d) })
  it('la più recente di almeno una settimana fa, altrimenti la più vecchia', () => {
    const list = [at('2026-10-20T08:00:00'), at('2026-10-13T08:00:00'), at('2026-10-06T08:00:00'), at('2026-10-15T08:00:00')]
    expect(defaultFrom(list, now)!.at.getDate()).toBe(13)
    expect(defaultFrom([at('2026-10-20T08:00:00'), at('2026-10-19T08:00:00')], now)!.at.getDate()).toBe(19)
    expect(defaultFrom([], now)).toBeNull()
  })
})
