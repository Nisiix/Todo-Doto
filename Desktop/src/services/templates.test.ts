import { describe, expect, it } from 'vitest'
import { materializeTemplate, templateFromProject } from './templates'
import { ItemSchema, ProjectSchema } from '@/types'

const project = ProjectSchema.parse({
  id: 'p',
  name: 'Sito cliente',
  description: 'Sito vetrina',
  createdAt: '2026-09-01T08:00:00Z',
  createdBy: 'u',
  updatedAt: '2026-09-01T08:00:00Z',
  updatedBy: 'u',
  attachmentFolders: [{ id: 'f1', name: 'Specifiche' }],
  milestones: [{ id: 'm1', name: 'Online', dueDate: '2026-09-30', createdAt: '' }],
  stack: { languages: ['TypeScript'] },
  items: [
    ItemSchema.parse({ id: 'b', seq: 2, title: 'Contenuti', createdAt: '2026-09-02T00:00:00Z', createdBy: 'u', status: 'confermato', dueDate: '2026-09-15', milestoneId: 'm1', bucket: 'done', checklist: [{ id: 'c', text: 'Testi', done: true }] }),
    ItemSchema.parse({ id: 'a', seq: 1, title: 'Grafica', createdAt: '2026-09-01T00:00:00Z', createdBy: 'u', priority: 'alta' }),
    ItemSchema.parse({ id: 't', seq: 3, title: 'Scartato', createdAt: '2026-09-01T00:00:00Z', createdBy: 'u', bucket: 'trash' }),
    ItemSchema.parse({ id: 'r', seq: 4, title: 'Ripetuto, già fatto', createdAt: '2026-09-01T00:00:00Z', createdBy: 'u', bucket: 'done', repeat: 'month' }),
  ],
})

describe('modelli di progetto', () => {
  const t = templateFromProject(project, { name: ' Sito vetrina ', by: 'u', now: '2026-10-20T10:00:00Z', id: 'ptp_1' })

  it('dal progetto al modello: date relative all’inizio, niente cestino né ripetuti già fatti, lista senza spunte', () => {
    expect(t).toMatchObject({ id: 'ptp_1', name: 'Sito vetrina', description: 'Sito vetrina', attachmentFolders: ['Specifiche'], milestones: [{ name: 'Online', dueOffset: 29 }] })
    expect(t.stack.languages).toEqual(['TypeScript'])
    expect(t.tasks.map((x) => [x.title, x.dueOffset, x.milestone, x.checklist])).toEqual([
      ['Grafica', null, null, []],
      ['Contenuti', 14, 0, ['Testi']],
    ])
  })

  it('dal modello al progetto nuovo: date da oggi, tappe nuove collegate, liste da rifare', () => {
    const r = materializeTemplate(t, '2026-11-02', '2026-11-02T09:00:00Z')
    expect(r.milestones.map((x) => [x.name, x.dueDate])).toEqual([['Online', '2026-12-01']])
    expect(r.tasks.map((x) => [x.title, x.dueDate, x.priority])).toEqual([
      ['Grafica', null, 'alta'],
      ['Contenuti', '2026-11-16', 'media'],
    ])
    expect(r.tasks[1]!.milestoneId).toBe(r.milestones[0]!.id)
    expect(r.tasks[1]!.checklist).toMatchObject([{ text: 'Testi', done: false }])
  })
})
