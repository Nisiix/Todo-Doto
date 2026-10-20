import { describe, expect, it } from 'vitest'
import { cleanupFindings } from './cleanup'
import { ItemSchema, ProjectSchema } from '@/types'

const today = '2026-10-20'
const proj = (id: string, over: Record<string, unknown> = {}) =>
  ProjectSchema.parse({ id, name: id, createdAt: '2026-01-01T00:00:00Z', createdBy: 'u', updatedAt: '2026-10-19T00:00:00Z', updatedBy: 'u', ...over })
const item = (over: Record<string, unknown>) => ItemSchema.parse({ id: Math.random().toString(36).slice(2), title: 't', createdAt: '2026-10-19T00:00:00Z', createdBy: 'u', ...over })

describe('pulizia guidata', () => {
  it('trova etichette, cartelle, progetti fermi, file mancanti, tappe da chiudere e cestini vecchi', () => {
    const projects = [
      proj('attivo', { folderId: 'f1', items: [item({ labelId: 'l1' })], attachments: [{ id: 'a1', kind: 'file', name: 'spec.pdf', target: 'Z:/spec.pdf', addedBy: 'u', addedAt: '' }, { id: 'a2', kind: 'link', name: 'Sito', target: 'https://x', addedBy: 'u', addedAt: '' }] }),
      proj('fermo', { updatedAt: '2026-06-01T00:00:00Z', items: [item({ createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' })] }),
      proj('tappe', {
        milestones: [{ id: 'm1', name: 'v1', dueDate: '2026-10-01', createdAt: '' }, { id: 'm2', name: 'v2', dueDate: '2026-10-01', createdAt: '' }],
        items: [
          item({ milestoneId: 'm1', bucket: 'done', completedAt: '2026-10-18T00:00:00Z' }),
          item({ milestoneId: 'm2' }),
          item({ bucket: 'trash', trashedAt: '2026-05-01T00:00:00Z' }),
          item({ bucket: 'trash', trashedAt: '2026-10-10T00:00:00Z' }),
        ],
      }),
      proj('cestinato', { trashedAt: '2026-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }),
    ]
    const f = cleanupFindings({
      projects,
      labels: [{ id: 'l1', name: 'Bug', color: '#000' }, { id: 'l2', name: 'Mai usata', color: '#000' }],
      folders: [{ id: 'f1', name: 'Clienti', parentId: null, order: 0 }, { id: 'f2', name: 'Vuota', parentId: null, order: 1 }, { id: 'f3', name: 'Madre', parentId: null, order: 2 }, { id: 'f4', name: 'Figlia', parentId: 'f3', order: 0 }],
      today,
      missingFiles: new Set(['a1']),
    })
    const key = (x: (typeof f)[number]) =>
      x.kind === 'unused_label' ? `${x.kind}:${x.label.name}` : x.kind === 'empty_folder' ? `${x.kind}:${x.folder.name}` : x.kind === 'missing_file' ? `${x.kind}:${x.attachment.name}` : x.kind === 'milestone_done' ? `${x.kind}:${x.milestone.name}` : x.kind === 'old_trash' ? `${x.kind}:${x.count}` : `${x.kind}:${x.project.name}:${x.open}`
    expect(f.map(key).sort()).toEqual(['empty_folder:Figlia', 'empty_folder:Vuota', 'idle_project:fermo:1', 'milestone_done:v1', 'missing_file:spec.pdf', 'old_trash:1', 'unused_label:Mai usata'])
  })
})
