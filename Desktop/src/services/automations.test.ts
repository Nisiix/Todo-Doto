import { describe, expect, it } from 'vitest'
import { automationHits, shouldAskDueDate } from './automations'
import { AutomationsSchema, ItemSchema, type Item } from '@/types'

const NOW = '2026-10-21T12:00:00.000Z'
const ago = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString()
let n = 0
const item = (over: Record<string, unknown>): Item => ItemSchema.parse({ id: `i${++n}`, title: `T${n}`, createdAt: ago(0), createdBy: 'u1', ...over })
const question = (over: Record<string, unknown>) => ({ id: `q${++n}`, authorId: 'u1', text: 'Che versione di Node?\naltro', createdAt: ago(6), mentions: ['me'], ...over })

const ON = AutomationsSchema.parse({ urgentUnassigned: { enabled: true }, unansweredQuestion: { enabled: true }, confirmedNoDue: { enabled: true } })
const OFF = AutomationsSchema.parse({})

describe('regole predefinite', () => {
  it('spente, con 1 e 5 giorni', () => {
    expect(OFF).toEqual({ urgentUnassigned: { enabled: false, days: 1 }, unansweredQuestion: { enabled: false, days: 5 }, confirmedNoDue: { enabled: false } })
  })
})

describe('urgente senza responsabile', () => {
  const urgent = item({ priority: 'immediata', createdAt: ago(2) })
  const projects = [
    {
      id: 'p',
      name: 'Sito',
      trashedAt: null,
      items: [
        urgent,
        item({ priority: 'immediata', createdAt: ago(0.5) }), // da meno di un giorno
        item({ priority: 'immediata', createdAt: ago(3), assigneeId: 'u2' }), // ha un responsabile
        item({ priority: 'alta', createdAt: ago(3) }),
        item({ priority: 'immediata', createdAt: ago(3), bucket: 'done' }),
      ],
    },
    { id: 'x', name: 'Cestinato', trashedAt: ago(1), items: [item({ priority: 'immediata', createdAt: ago(3) })] },
  ]
  it('solo agli amministratori, dopo i giorni indicati', () => {
    const hits = automationHits(projects, ON, { now: NOW, meId: 'me', isAdmin: true })
    expect(hits).toEqual([{ rule: 'urgentUnassigned', key: `auto:urgent:${urgent.id}`, project: { id: 'p', name: 'Sito' }, item: urgent, days: 2 }])
    expect(automationHits(projects, ON, { now: NOW, meId: 'me', isAdmin: false })).toEqual([])
    expect(automationHits(projects, OFF, { now: NOW, meId: 'me', isAdmin: true })).toEqual([])
  })
  it('con una soglia più alta aspetta di più', () => {
    const rules = { ...ON, urgentUnassigned: { enabled: true, days: 3 } }
    expect(automationHits(projects, rules, { now: NOW, meId: 'me', isAdmin: true })).toEqual([])
  })
})

describe('domanda senza risposta', () => {
  const waiting = question({})
  const t = item({ questions: [waiting, question({ createdAt: ago(2) }), question({ answers: [{ id: 'a', authorId: 'u2', text: 'ok', createdAt: ago(1) }] }), question({ resolved: true }), question({ mentions: ['altri'] }), question({ authorId: 'me' })] })
  const projects = [{ id: 'p', name: 'Sito', trashedAt: null, items: [t] }]
  it('solo a chi è menzionato, dopo i giorni indicati, una volta per domanda', () => {
    const hits = automationHits(projects, ON, { now: NOW, meId: 'me', isAdmin: false })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ rule: 'unansweredQuestion', key: `auto:question:${waiting.id}`, days: 6, questionId: waiting.id, question: 'Che versione di Node?' })
    expect(automationHits(projects, ON, { now: NOW, meId: null, isAdmin: false })).toEqual([])
  })
})

describe('scadenza alla conferma', () => {
  const before = { status: 'da_definire' as const }
  const after = { status: 'confermato' as const, dueDate: null, bucket: 'todo' as const }
  it('solo quando il task diventa Confermato senza scadenza', () => {
    expect(shouldAskDueDate(ON, before, after)).toBe(true)
    expect(shouldAskDueDate(OFF, before, after)).toBe(false)
    expect(shouldAskDueDate(ON, { status: 'confermato' }, after)).toBe(false)
    expect(shouldAskDueDate(ON, before, { ...after, dueDate: '2026-11-01' })).toBe(false)
    expect(shouldAskDueDate(ON, before, undefined)).toBe(false)
  })
})
