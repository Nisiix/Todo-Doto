import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { ganttGroups, ganttItems, ganttRange, toBar } from './gantt'
import { applyStatusRules, canHaveDueDate } from './items'
import type { Item, Label } from '@/types'

const item = (over: Partial<Item>): Item => ({
  id: Math.random().toString(36).slice(2), title: 'x', notes: '', priority: 'media', status: 'confermato', dueDate: '2026-10-20', labelId: null,
  assigneeId: null, bucket: 'todo', createdAt: '2026-10-01T09:00:00Z', createdBy: 'u1', completedAt: null, trashedAt: null, comments: [], questions: [],
  seq: 0, closedByCommit: null, blockedBy: [], milestoneId: null, estimateHours: null, checklist: [], confirmedAt: '2026-10-10T09:00:00Z', ...over,
})
const labels: Label[] = [
  { id: 'l_bug', name: 'Bug', color: '#e5484d' },
  { id: 'l_ux', name: 'UX', color: '#3e63dd' },
] as Label[]
const today = dayjs('2026-10-15')

describe('scadenza solo con stato Confermato', () => {
  it('lasciando Confermato si tolgono scadenza e data di conferma; diventandolo si registra quando', () => {
    expect(canHaveDueDate('confermato')).toBe(true)
    expect(canHaveDueDate('da_definire')).toBe(false)
    const it1 = { status: 'da_valutare' as const, dueDate: '2026-11-01', confirmedAt: '2026-10-01' }
    applyStatusRules(it1, '2026-10-15T10:00:00Z')
    expect(it1).toEqual({ status: 'da_valutare', dueDate: null, confirmedAt: null })
    const it2 = { status: 'confermato' as const, dueDate: '2026-11-01', confirmedAt: null as string | null }
    applyStatusRules(it2, '2026-10-15T10:00:00Z')
    expect(it2.confirmedAt).toBe('2026-10-15T10:00:00Z')
    applyStatusRules(it2, '2026-10-20T10:00:00Z') // resta la prima conferma
    expect(it2.confirmedAt).toBe('2026-10-15T10:00:00Z')
  })
})

describe('Gantt', () => {
  it('solo Confermati con scadenza, non nel cestino; i completati solo se richiesti', () => {
    const items = [
      item({ title: 'ok' }),
      item({ title: 'senza scadenza', dueDate: null }),
      item({ title: 'da definire', status: 'da_definire' }),
      item({ title: 'cestinato', bucket: 'trash' }),
      item({ title: 'completato', bucket: 'done' }),
    ]
    expect(ganttItems(items).map((i) => i.title)).toEqual(['ok'])
    expect(ganttItems(items, { includeDone: true }).map((i) => i.title)).toEqual(['ok', 'completato'])
  })
  it('barra dalla conferma alla scadenza; tappa se la scadenza è prima; in ritardo se passata', () => {
    expect(toBar(item({}), today)).toMatchObject({ start: '2026-10-10', end: '2026-10-20', milestone: false, overdue: false })
    expect(toBar(item({ confirmedAt: null }), today).start).toBe('2026-10-01') // task di prima: dalla creazione
    expect(toBar(item({ dueDate: '2026-10-05' }), today)).toMatchObject({ start: '2026-10-05', milestone: true, overdue: true })
  })
  it('raggruppa per etichetta (nell’ordine delle etichette, senza etichetta in fondo) o per priorità', () => {
    const items = [
      item({ title: 'a', labelId: 'l_ux', priority: 'bassa' }),
      item({ title: 'b', labelId: 'l_bug', priority: 'media', dueDate: '2026-10-25' }),
      item({ title: 'c', labelId: 'l_bug', priority: 'immediata', dueDate: '2026-10-30' }),
      item({ title: 'd', labelId: null, priority: 'alta' }),
    ]
    const byLabel = ganttGroups(items, 'label', labels, { noLabel: 'Senza etichetta' }, { today })
    expect(byLabel.map((g) => g.title)).toEqual(['Bug', 'UX', 'Senza etichetta'])
    expect(byLabel[0]!.bars.map((b) => b.item.title)).toEqual(['c', 'b']) // per priorità dentro il gruppo
    const byPrio = ganttGroups(items, 'priority', labels, { noLabel: '' }, { today })
    expect(byPrio.map((g) => g.priority)).toEqual(['immediata', 'alta', 'media', 'bassa'])
  })
  it('intervallo di giorni: dal primo inizio all’ultima scadenza, oggi compreso, con un margine', () => {
    const groups = ganttGroups([item({})], 'label', labels, { noLabel: '' }, { today })
    const r = ganttRange(groups, today, 3)
    expect(r.from.format('YYYY-MM-DD')).toBe('2026-10-07')
    expect(r.days).toBe(dayjs('2026-10-23').diff(r.from, 'day') + 1)
  })
})
