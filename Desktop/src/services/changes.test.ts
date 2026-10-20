import { describe, expect, it } from 'vitest'
import { diffProjects } from './changes'
import type { Item, Project } from '@/types'

const item = (over: Partial<Item>): Item => ({
  id: 'i1', title: 'Export XBRL\nriga 2', notes: '', priority: 'media', status: 'da_valutare', dueDate: null, labelId: null, assigneeId: null,
  bucket: 'todo', createdAt: '', createdBy: 'u1', completedAt: null, trashedAt: null, comments: [], questions: [], seq: 0, closedByCommit: null, blockedBy: [], milestoneId: null, estimateHours: null, checklist: [], repeat: 'none', confirmedAt: null, ...over,
})
const project = (items: Item[], updatedBy = 'u2'): Project =>
  ({ id: 'p', name: 'P', items, updatedBy, members: [], attachments: [], attachmentFolders: [] }) as unknown as Project

describe('diffProjects: cosa è cambiato tra due versioni', () => {
  it('rileva creazione, completamento, cestino, ripristino e riapertura', () => {
    const a = project([item({ id: 'x', bucket: 'todo' }), item({ id: 'y', bucket: 'done' }), item({ id: 'z', bucket: 'trash' })])
    const b = project([item({ id: 'x', bucket: 'done' }), item({ id: 'y', bucket: 'todo' }), item({ id: 'z', bucket: 'todo' }), item({ id: 'n' })])
    const types = diffProjects(a, b).map((c) => `${c.itemId}:${c.type}:${c.text}`)
    expect(types).toEqual([
      'x:item_completed:ha completato l’elemento',
      'y:item_completed:ha riaperto l’elemento',
      'z:item_trashed:ha ripristinato l’elemento dal cestino',
      'n:item_created:ha aggiunto un elemento',
    ])
    expect(diffProjects(a, b)[0]!.itemTitle).toBe('Export XBRL') // prima riga del titolo
    expect(diffProjects(a, b)[0]!.byId).toBe('u2')
  })

  it('rileva stato, descrizione, commenti, domande e risposte con l’autore giusto e le menzioni', () => {
    const a = project([item({ id: 'x', questions: [{ id: 'q1', authorId: 'u1', text: 'Q?', mentions: [], createdAt: '', resolved: false, resolvedAt: null, answers: [], decision: null }] })])
    const b = project([
      item({
        id: 'x',
        status: 'confermato',
        notes: 'nuove note',
        comments: [{ id: 'c1', authorId: 'u3', text: 'ciao @Mario', mentions: ['u1'], createdAt: '' }],
        questions: [
          { id: 'q1', authorId: 'u1', text: 'Q?', mentions: [], createdAt: '', resolved: false, resolvedAt: null, answers: [{ id: 'a1', authorId: 'u4', text: 'R', mentions: [], createdAt: '' }], decision: null },
          { id: 'q2', authorId: 'u5', text: 'Altra?', mentions: ['u2'], createdAt: '', resolved: false, resolvedAt: null, answers: [], decision: null },
        ],
      }),
    ])
    const changes = diffProjects(a, b)
    expect(changes.map((c) => c.type)).toEqual(['item_status', 'item_notes', 'comment', 'answer', 'question'])
    expect(changes[2]).toMatchObject({ byId: 'u3', mentions: ['u1'] })
    expect(changes[3]!.byId).toBe('u4')
    expect(changes[4]).toMatchObject({ byId: 'u5', mentions: ['u2'] })
  })

  it('nessuna differenza → nessuna notifica', () => {
    const a = project([item({ id: 'x' })])
    expect(diffProjects(a, project([item({ id: 'x' })]))).toEqual([])
  })

  it('sblocco: completato l’ultimo bloccante, l’assegnatario del task bloccato lo sa', () => {
    const a = project([item({ id: 'b1' }), item({ id: 't', blockedBy: ['b1'], assigneeId: 'u7' }), item({ id: 'n', blockedBy: ['b1'] })])
    const b = project([item({ id: 'b1', bucket: 'done' }), item({ id: 't', blockedBy: ['b1'], assigneeId: 'u7' }), item({ id: 'n', blockedBy: ['b1'] })])
    const unblocked = diffProjects(a, b).filter((c) => c.type === 'unblocked')
    // il task senza assegnatario non genera nulla
    expect(unblocked.map((c) => [c.itemId, c.mentions])).toEqual([['t', ['u7']]])
    expect(unblocked[0]!.text).toContain('ora puoi partire')
  })
})
