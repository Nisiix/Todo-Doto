import { describe, expect, it } from 'vitest'
import { blockedByThis, blockerCandidates, criticalChain, dueConflicts, isBlocked, newlyUnblocked, openBlockers, pruneBlockers, wouldCycle } from './dependencies'
import { ItemSchema, type Item } from '@/types'

const T = '2026-10-01T10:00:00.000Z'
const item = (id: string, over: Record<string, unknown> = {}): Item => ItemSchema.parse({ id, title: id, createdAt: T, createdBy: 'u1', ...over })

// a ← b ← c (c aspetta b che aspetta a); d aspetta a e x (completato); e libero
const items = () => [
  item('a', { status: 'confermato', dueDate: '2026-11-10' }),
  item('b', { blockedBy: ['a'], status: 'confermato', dueDate: '2026-11-05' }),
  item('c', { blockedBy: ['b'] }),
  item('d', { blockedBy: ['a', 'x'] }),
  item('x', { bucket: 'done' }),
  item('e'),
]

describe('dipendenze', () => {
  it('bloccanti aperti: i completati non bloccano', () => {
    const all = items()
    const d = all.find((i) => i.id === 'd')!
    expect(openBlockers(d, all).map((i) => i.id)).toEqual(['a'])
    expect(isBlocked(d, all)).toBe(true)
    expect(isBlocked(all.find((i) => i.id === 'e')!, all)).toBe(false)
    expect(blockedByThis('a', all).map((i) => i.id)).toEqual(['b', 'd'])
  })

  it('cicli: diretti, indiretti e verso sé stesso', () => {
    const all = items()
    expect(wouldCycle(all, 'a', 'c')).toBe(true) // a aspetterebbe c che aspetta b che aspetta a
    expect(wouldCycle(all, 'a', 'b')).toBe(true)
    expect(wouldCycle(all, 'a', 'a')).toBe(true)
    expect(wouldCycle(all, 'c', 'e')).toBe(false)
  })

  it('candidati: da fare, non già scelti, senza cicli', () => {
    const all = items()
    expect(blockerCandidates(all.find((i) => i.id === 'a')!, all).map((i) => i.id)).toEqual(['e']) // b, c, d aspettano già a
    expect(blockerCandidates(all.find((i) => i.id === 'c')!, all).map((i) => i.id)).toEqual(['a', 'd', 'e'])
  })

  it('conflitto di scadenza: il bloccante scade dopo il task', () => {
    const all = items()
    expect(dueConflicts(all.find((i) => i.id === 'b')!, all).map((i) => i.id)).toEqual(['a'])
    expect(dueConflicts(all.find((i) => i.id === 'c')!, all)).toEqual([])
  })

  it('catena critica: la sequenza più lunga di task aperti', () => {
    expect(criticalChain(items()).map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(criticalChain([item('solo')])).toEqual([])
    // un ciclo scritto a mano nel file non manda in loop
    const loop = [item('p', { blockedBy: ['q'] }), item('q', { blockedBy: ['p'] })]
    expect(criticalChain(loop).length).toBe(2)
  })

  it('sbloccati: completare l’ultimo bloccante libera chi aspettava', () => {
    const prev = items()
    const next = items().map((i) => (i.id === 'a' ? { ...i, bucket: 'done' as const } : i))
    expect(newlyUnblocked(prev, next).map((i) => i.id)).toEqual(['b', 'd'])
    expect(newlyUnblocked(prev, prev)).toEqual([])
  })

  it('pulizia: via i riferimenti a task eliminati e a sé stessi', () => {
    const all = [item('a', { blockedBy: ['a', 'zz'] }), item('b', { blockedBy: ['a'] })]
    expect(pruneBlockers(all)).toBe(true)
    expect(all.map((i) => i.blockedBy)).toEqual([[], ['a']])
    expect(pruneBlockers(all)).toBe(false)
  })
})
