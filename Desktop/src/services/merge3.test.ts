import { describe, expect, it } from 'vitest'
import { mergeProject } from './merge3'
import { ItemSchema, ProjectSchema, type Project } from '@/types'

const T = '2026-10-01T10:00:00.000Z'
const item = (id: string, title: string, seq: number, extra: Record<string, unknown> = {}) => ItemSchema.parse({ id, title, seq, createdAt: T, createdBy: 'usr_1', ...extra })
const base = ProjectSchema.parse({
  schema: 1,
  id: 'prj_1',
  name: 'Sito',
  description: 'Descrizione',
  version: 5,
  createdAt: T,
  createdBy: 'usr_1',
  updatedAt: T,
  updatedBy: 'usr_1',
  nextSeq: 4,
  items: [item('a', 'Pagina contatti', 1), item('b', 'Menu mobile', 2), item('c', 'Footer', 3)],
})
const copy = (p: Project): Project => JSON.parse(JSON.stringify(p))

describe('unione delle modifiche fatte fuori ufficio', () => {
  it('campi diversi cambiati da parti diverse: si tengono entrambi', () => {
    const local = copy(base)
    local.items[0]!.priority = 'alta'
    local.items[1]!.bucket = 'done'
    local.items[1]!.completedAt = '2026-10-02T10:00:00.000Z'
    const remote = copy(base)
    remote.items[0]!.title = 'Pagina contatti (nuova)'
    remote.items[2]!.assigneeId = 'usr_2'
    const { merged, report } = mergeProject(base, local, remote)
    expect(merged.items[0]).toMatchObject({ title: 'Pagina contatti (nuova)', priority: 'alta' })
    expect(merged.items[1]).toMatchObject({ bucket: 'done', completedAt: '2026-10-02T10:00:00.000Z' })
    expect(merged.items[2]!.assigneeId).toBe('usr_2')
    expect(report.conflicts).toEqual([])
    expect(report.applied).toBe(2)
  })

  it('stesso campo cambiato da entrambi: vince la cartella condivisa, la propria versione è nel resoconto', () => {
    const local = copy(base)
    local.items[0]!.title = 'Titolo mio'
    const remote = copy(base)
    remote.items[0]!.title = 'Titolo del collega'
    const { merged, report } = mergeProject(base, local, remote)
    expect(merged.items[0]!.title).toBe('Titolo del collega')
    expect(report.conflicts).toEqual([{ item: 'Titolo del collega', field: 'title', mine: 'Titolo mio', theirs: 'Titolo del collega' }])
  })

  it('task nuovi da entrambe le parti: tutti presenti, con numeri TODO diversi', () => {
    const local = copy(base)
    local.items.push(item('n1', 'Creato offline', 4))
    local.nextSeq = 5
    const remote = copy(base)
    remote.items.push(item('r1', 'Creato da Carla', 4))
    remote.nextSeq = 5
    const { merged, report } = mergeProject(base, local, remote)
    expect(merged.items.map((i) => i.title)).toEqual(['Pagina contatti', 'Menu mobile', 'Footer', 'Creato da Carla', 'Creato offline'])
    const seqs = merged.items.map((i) => i.seq)
    expect(new Set(seqs).size).toBe(seqs.length)
    expect(merged.nextSeq).toBe(6)
    expect(report.applied).toBe(1)
  })

  it('commenti e risposte si uniscono; un task eliminato dal collega non torna e la modifica persa si segnala', () => {
    const local = copy(base)
    local.items[0]!.comments.push({ id: 'cm1', authorId: 'usr_1', text: 'mio', mentions: [], createdAt: T })
    local.items[2]!.title = 'Footer rivisto'
    const remote = copy(base)
    remote.items[0]!.comments.push({ id: 'cm2', authorId: 'usr_2', text: 'suo', mentions: [], createdAt: T })
    remote.items = remote.items.filter((i) => i.id !== 'c')
    const { merged, report } = mergeProject(base, local, remote)
    expect(merged.items[0]!.comments.map((c) => c.text)).toEqual(['suo', 'mio'])
    expect(merged.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(report.dropped).toEqual(['Footer rivisto'])
  })

  it('decisione presa fuori ufficio: arriva nella cartella anche se intanto un collega ha risposto', () => {
    const q = { id: 'q1', authorId: 'usr_1', text: 'Quale libreria?', mentions: [], createdAt: T, resolved: false, resolvedAt: null, decision: null, answers: [{ id: 'a1', authorId: 'usr_2', text: 'Day.js', mentions: [], createdAt: T }] }
    const b = copy(base)
    b.items[0]!.questions.push(q)
    const local = copy(b)
    local.items[0]!.questions[0]!.decision = { answerId: 'a1', rationale: 'leggera', at: T, by: 'usr_1' }
    local.items[0]!.questions[0]!.resolved = true
    const remote = copy(b)
    remote.items[0]!.questions[0]!.answers.push({ id: 'a2', authorId: 'usr_3', text: 'Luxon', mentions: [], createdAt: T })
    const { merged } = mergeProject(b, local, remote)
    const mq = merged.items[0]!.questions[0]!
    expect(mq.decision).toMatchObject({ answerId: 'a1', rationale: 'leggera' })
    expect(mq.resolved).toBe(true)
    expect(mq.answers.map((a) => a.text)).toEqual(['Day.js', 'Luxon'])
  })

  it('campi del progetto: la descrizione cambiata solo qui passa; cambiata da entrambi è un conflitto', () => {
    const local = copy(base)
    local.description = 'Nuova descrizione'
    const remote = copy(base)
    expect(mergeProject(base, local, remote).merged.description).toBe('Nuova descrizione')
    remote.description = 'Altra descrizione'
    const r = mergeProject(base, local, remote)
    expect(r.merged.description).toBe('Altra descrizione')
    expect(r.report.conflicts[0]!.field).toBe('project:description')
  })
})
