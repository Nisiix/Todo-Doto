import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { applyFilter, compareTodo, countByBucket, dueState, isArchived, firstLine, formatDue, isFilterActive, matchesSearch, searchAll, sortForBucket, spotlight } from './items'
import { EMPTY_FILTER, type Item, type Project } from '@/types'

const base: Item = {
  id: 'itm_a',
  title: 'A',
  notes: '',
  priority: 'media',
  status: 'da_valutare',
  dueDate: null,
  labelId: null,
  assigneeId: null,
  bucket: 'todo',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'usr_1',
  completedAt: null,
  trashedAt: null,
  comments: [],
  questions: [],
  seq: 0,
  closedByCommit: null,
  confirmedAt: null,
}
const item = (over: Partial<Item>): Item => ({ ...base, ...over })

describe('ordinamento della lista Da fare', () => {
  it('ordina per priorità, poi scadenza, poi creazione', () => {
    const list = [
      item({ id: '1', priority: 'bassa' }),
      item({ id: '2', priority: 'immediata', dueDate: '2026-12-01' }),
      item({ id: '3', priority: 'immediata', dueDate: '2026-11-01' }),
      item({ id: '4', priority: 'alta', createdAt: '2026-02-01T00:00:00.000Z' }),
      item({ id: '5', priority: 'alta', createdAt: '2026-01-15T00:00:00.000Z' }),
      item({ id: '6', priority: 'immediata' }), // senza scadenza: dopo quelli con scadenza
    ]
    expect(sortForBucket(list, 'todo').map((i) => i.id)).toEqual(['3', '2', '6', '5', '4', '1'])
    expect([...list].sort(compareTodo)[0]!.id).toBe('3')
  })

  it('in Completati e Cestino mette per primi i più recenti', () => {
    const list = [
      item({ id: 'old', bucket: 'done', completedAt: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'new', bucket: 'done', completedAt: '2026-03-01T00:00:00.000Z' }),
    ]
    expect(sortForBucket(list, 'done').map((i) => i.id)).toEqual(['new', 'old'])
  })
})

describe('scadenze', () => {
  const now = dayjs('2026-10-14')
  it('classifica la scadenza rispetto a oggi', () => {
    expect(dueState(null, 3, now)).toBe('none')
    expect(dueState('2026-10-13', 3, now)).toBe('overdue')
    expect(dueState('2026-10-14', 3, now)).toBe('soon')
    expect(dueState('2026-10-17', 3, now)).toBe('soon')
    expect(dueState('2026-10-18', 3, now)).toBe('later')
  })
  it('formatta senza anno se è l’anno corrente', () => {
    expect(formatDue('2026-11-30', now)).toBe('30 nov')
    expect(formatDue('2027-01-05', now)).toBe('5 gen 2027')
  })
})

describe('ricerca e conteggi', () => {
  it('cerca in titolo e note, senza distinguere maiuscole', () => {
    const it1 = item({ title: 'Export XBRL', notes: 'tassonomia 2025' })
    expect(matchesSearch(it1, 'xbrl')).toBe(true)
    expect(matchesSearch(it1, 'TASSO')).toBe(true)
    expect(matchesSearch(it1, 'spid')).toBe(false)
    expect(matchesSearch(it1, '   ')).toBe(true)
  })
  it('conta gli elementi per contenitore', () => {
    const c = countByBucket([item({}), item({ bucket: 'done' }), item({ bucket: 'trash' }), item({ bucket: 'done' })])
    expect(c).toEqual({ todo: 1, done: 2, trash: 1 })
  })
})

describe('da tenere d’occhio', () => {
  it('include gli immediati e le scadenze entro 7 giorni, esclude completati', () => {
    const now = dayjs('2026-10-14')
    const project = {
      id: 'prj_1',
      items: [
        item({ id: 'imm', priority: 'immediata' }),
        item({ id: 'soon', dueDate: '2026-10-20' }),
        item({ id: 'far', dueDate: '2026-12-20' }),
        item({ id: 'done', priority: 'immediata', bucket: 'done' }),
      ],
    } as unknown as Project
    expect(spotlight([project], 7, now).map((s) => s.item.id)).toEqual(['imm', 'soon'])
  })
})

describe('filtri della lista', () => {
  const list = [
    item({ id: 'a', dueDate: '2026-10-10', status: 'confermato', priority: 'alta', createdBy: 'u1', labelId: 'l1' }),
    item({ id: 'b', dueDate: '2026-10-20', status: 'da_valutare', priority: 'bassa', createdBy: 'u2', assigneeId: 'u1' }),
    item({ id: 'c', dueDate: null, status: 'da_definire', priority: 'immediata', createdBy: 'u1' }),
  ]
  const ids = (r: Item[]) => r.map((i) => i.id)

  it('senza filtri restituisce tutto', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(applyFilter(list, EMPTY_FILTER)).toBe(list)
  })
  it('per intervallo di scadenza (chi non ha scadenza è escluso)', () => {
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, from: '2026-10-15' }))).toEqual(['b'])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, to: '2026-10-15' }))).toEqual(['a'])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, from: '2026-10-01', to: '2026-10-31' }))).toEqual(['a', 'b'])
  })
  it('per stato, priorità, assegnatario, autore ed etichetta, combinabili', () => {
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, statuses: ['da_valutare', 'da_definire'] }))).toEqual(['b', 'c'])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, priorities: ['immediata'] }))).toEqual(['c'])
    // "Creato da" e "Assegnato a" sono filtri distinti: b è creato da u2 ma assegnato a u1
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, createdBy: 'u1' }))).toEqual(['a', 'c'])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, assigneeId: 'u1' }))).toEqual(['b'])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, createdBy: 'u2', assigneeId: 'u1' }))).toEqual(['b'])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, labelId: 'l1' }))).toEqual(['a'])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, createdBy: 'u1', priorities: ['alta'] }))).toEqual(['a'])
  })
  it('prima riga del titolo', () => {
    expect(firstLine('Prima\nSeconda')).toBe('Prima')
    expect(firstLine('\n  \nTerza')).toBe('Terza')
    expect(firstLine('')).toBe('')
  })
})

describe('ricerca globale', () => {
  const project = (id: string, name: string, items: Item[], attachments: { name: string; target: string }[] = []) =>
    ({ id, name, items, attachments }) as unknown as Project
  const projects = [
    project('p1', 'Bilancio Europeo', [item({ id: 'x1', title: 'Export XBRL' }), item({ id: 'x2', title: 'Vecchio export', bucket: 'done' }), item({ id: 'y', title: 'Login SPID' })]),
    project('p2', 'Export dati', [item({ id: 'z', title: 'Altro' })]),
    project('p3', 'Nulla', [], [{ name: 'Tracciato export.pdf', target: 'Z:\\doc.pdf' }]),
  ]

  it('vuota senza testo', () => {
    expect(searchAll(projects, '  ')).toEqual([])
  })
  it('raggruppa per progetto, nome del progetto compreso, da fare prima dei completati', () => {
    const hits = searchAll(projects, 'export')
    expect(hits.map((h) => h.project.id)).toEqual(['p2', 'p1', 'p3'])
    expect(hits[0]!.nameMatch).toBe(true)
    expect(hits[0]!.items).toEqual([])
    expect(hits[1]!.items.map((i) => i.id)).toEqual(['x1', 'x2'])
    expect(hits[2]!.attachments.map((a) => a.name)).toEqual(['Tracciato export.pdf'])
  })
  it('cerca anche nella descrizione e limita i risultati per progetto', () => {
    const many = project('p9', 'Tanti', Array.from({ length: 20 }, (_, i) => item({ id: `m${i}`, title: `Voce ${i}`, notes: 'parola chiave' })))
    const hits = searchAll([many], 'chiave', 5)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.items).toHaveLength(5)
  })
})

describe('archivio dei completati', () => {
  const now = dayjs('2026-10-20T12:00:00Z')
  it('solo i completati da più di 90 giorni', () => {
    expect(isArchived({ bucket: 'done', completedAt: '2026-07-01T10:00:00Z' }, now)).toBe(true)
    expect(isArchived({ bucket: 'done', completedAt: '2026-08-01T10:00:00Z' }, now)).toBe(false)
    expect(isArchived({ bucket: 'todo', completedAt: null }, now)).toBe(false)
    expect(isArchived({ bucket: 'trash', completedAt: '2025-01-01T10:00:00Z' }, now)).toBe(false)
    expect(isArchived({ bucket: 'done', completedAt: '2026-10-01T10:00:00Z' }, now, 7)).toBe(true)
  })
})
