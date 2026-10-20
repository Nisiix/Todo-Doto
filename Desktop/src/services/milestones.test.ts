import { describe, expect, it } from 'vitest'
import { milestoneProgress, prependChangelog, releaseNotes, sortMilestones } from './milestones'
import { ItemSchema, type Item } from '@/types'

const T = '2026-10-01T10:00:00.000Z'
let n = 0
const item = (over: Record<string, unknown>): Item => ItemSchema.parse({ id: `i${++n}`, title: `T${n}`, createdAt: T, createdBy: 'u1', ...over })
const today = '2026-10-20'

describe('tappe', () => {
  const items = [
    item({ title: 'Login', milestoneId: 'm1', bucket: 'done', labelId: 'feat', seq: 1, completedAt: '2026-10-02T10:00:00Z', closedByCommit: { hash: 'abcdef1234', author: 'A', date: '', subject: '' } }),
    item({ title: 'Crash all’avvio\ndettagli', milestoneId: 'm1', bucket: 'done', labelId: 'bug', seq: 2, completedAt: '2026-10-03T10:00:00Z' }),
    item({ title: 'Icone', milestoneId: 'm1', bucket: 'done', seq: 3, completedAt: '2026-10-04T10:00:00Z' }),
    item({ title: 'Export', milestoneId: 'm1', status: 'confermato', dueDate: '2026-10-15', seq: 4 }),
    item({ title: 'Cestinato', milestoneId: 'm1', bucket: 'trash' }),
    item({ title: 'Altra tappa', milestoneId: 'm2', bucket: 'done' }),
  ]

  it('avanzamento: completati, da fare, in ritardo, tappa in ritardo', () => {
    expect(milestoneProgress({ id: 'm1', dueDate: '2026-10-18', closedAt: null }, items, today)).toEqual({ total: 4, done: 3, todo: 1, overdue: 1, percent: 75, late: true })
    expect(milestoneProgress({ id: 'vuota', dueDate: null, closedAt: null }, items, today)).toMatchObject({ total: 0, percent: 0, late: false })
    expect(milestoneProgress({ id: 'm1', dueDate: '2026-10-18', closedAt: T }, items, today).late).toBe(false)
  })

  it('ordine: aperte per data (senza data in fondo), poi chiuse dalla più recente', () => {
    const ms = [
      { name: 'B', dueDate: null, closedAt: null },
      { name: 'Chiusa vecchia', dueDate: '2026-01-01', closedAt: '2026-01-02T00:00:00Z' },
      { name: 'A', dueDate: '2026-11-01', closedAt: null },
      { name: 'Chiusa recente', dueDate: '2026-05-01', closedAt: '2026-05-02T00:00:00Z' },
    ]
    expect(sortMilestones(ms).map((m) => m.name)).toEqual(['A', 'B', 'Chiusa recente', 'Chiusa vecchia'])
  })

  it('note di versione: per etichetta, con codice e commit; solo i completati della tappa', () => {
    const md = releaseNotes({ id: 'm1', name: 'v1.3', notes: 'Prima versione per il cliente.' }, items, {
      labels: [{ id: 'feat', name: 'Novità' }, { id: 'bug', name: 'Correzioni' }],
      other: 'Altro',
      date: '20 ott 2026',
      code: (i) => `TODO-${i.seq}`,
    })
    expect(md).toBe(
      [
        '## v1.3 — 20 ott 2026',
        '',
        'Prima versione per il cliente.',
        '',
        '### Novità',
        '',
        '- Login — TODO-1 (abcdef1)',
        '',
        '### Correzioni',
        '',
        '- Crash all’avvio — TODO-2',
        '',
        '### Altro',
        '',
        '- Icone — TODO-3',
        '',
      ].join('\n'),
    )
  })

  it('CHANGELOG: le note vanno prima della prima sezione; senza file nasce con un titolo', () => {
    const notes = '## v2 — oggi\n\n- Nuovo\n'
    expect(prependChangelog('# Novità\n\nIntro.\n\n## v1 — ieri\n\n- Vecchio\n', notes)).toBe('# Novità\n\nIntro.\n\n## v2 — oggi\n\n- Nuovo\n\n## v1 — ieri\n\n- Vecchio\n')
    expect(prependChangelog(null, notes)).toBe('# Changelog\n\n## v2 — oggi\n\n- Nuovo\n')
    expect(prependChangelog('# Solo titolo\n', notes)).toBe('# Solo titolo\n\n## v2 — oggi\n\n- Nuovo\n')
  })
})
