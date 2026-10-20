import { describe, expect, it } from 'vitest'
import { handoffNote } from './handoff'
import { ItemSchema } from '@/types'

const base = { fromName: 'Mario Rossi', toName: 'Anna', userName: (id: string) => (id === 'u1' ? 'Mario Rossi' : 'Luca'), openBlockers: [] as string[], commits: [] }

describe('nota di passaggio', () => {
  it('senza lavoro registrato', () => {
    const item = ItemSchema.parse({ id: 'i', title: 'Export', createdAt: '2026-10-01T00:00:00Z', createdBy: 'u1', status: 'confermato', dueDate: '2026-11-20' })
    expect(handoffNote({ ...base, item })).toBe('@Anna passaggio di consegne da Mario Rossi:\nStato: Confermato, scadenza 20 nov 2026.\nNessun lavoro registrato finora: si parte da zero.')
  })

  it('lista di controllo, blocchi, domande, commenti e commit', () => {
    const item = ItemSchema.parse({
      id: 'i',
      title: 'Export',
      createdAt: '2026-10-01T00:00:00Z',
      createdBy: 'u1',
      checklist: [{ id: 'c1', text: 'Schema', done: true }, { id: 'c2', text: 'Test', done: false }],
      questions: [{ id: 'q', authorId: 'u1', text: 'Formato date?', createdAt: '2026-10-02T00:00:00Z' }],
      comments: [
        { id: 'k1', authorId: 'u1', text: 'Primo', createdAt: '2026-10-02T00:00:00Z' },
        { id: 'k2', authorId: 'u1', text: 'Secondo', createdAt: '2026-10-03T00:00:00Z' },
        { id: 'k3', authorId: 'u2', text: 'Terzo', createdAt: '2026-10-04T00:00:00Z' },
      ],
    })
    const note = handoffNote({
      ...base,
      item,
      openBlockers: ['TODO-3 Schema DB'],
      commits: [{ commit: { hash: 'abcdef12345', author: 'M', date: '', message: 'TODO-1 bozza export\ncorpo' }, closes: false }],
    })
    expect(note).toContain('Lista di controllo: 1 di 2 voci fatte.')
    expect(note).toContain('Restano: Test.')
    expect(note).toContain('Aspetta ancora: TODO-3 Schema DB.')
    expect(note).toContain('1 domanda aperta:\n- Formato date?')
    expect(note).toContain('Ultimi commenti:\n- Mario Rossi: Secondo\n- Luca: Terzo')
    expect(note).not.toContain('Primo')
    expect(note).toContain('1 commit lo cita, l’ultimo: abcdef1 TODO-1 bozza export.')
    expect(note).not.toContain('si parte da zero')
  })
})
