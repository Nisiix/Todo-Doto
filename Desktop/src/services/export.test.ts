import { describe, expect, it } from 'vitest'
import { projectRows, projectToCsv, safeFileName } from './export'
import type { Item, Project } from '@/types'

const item = (over: Partial<Item>): Item => ({
  id: 'itm_' + Math.random().toString(36).slice(2, 8),
  title: 't',
  notes: '',
  priority: 'media',
  status: 'da_valutare',
  dueDate: null,
  labelId: null,
  bucket: 'todo',
  createdAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'usr_a',
  completedAt: null,
  trashedAt: null,
  comments: [],
  questions: [],
  ...over,
})

const project: Project = {
  schema: 1,
  id: 'prj_1',
  name: 'Bilancio Europeo Web',
  description: '',
  folderId: null,
  categoryId: null,
  members: [],
  version: 3,
  createdAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'usr_a',
  updatedAt: '2026-10-01T10:00:00.000Z',
  updatedBy: 'usr_a',
  trashedAt: null,
  items: [
    item({ title: 'Export XBRL', priority: 'alta', dueDate: '2026-11-30', labelId: 'lbl_bug' }),
    item({ title: 'Login SPID', priority: 'immediata', notes: 'con "virgolette"; e punto e virgola' }),
    item({ title: 'Fatto', bucket: 'done', completedAt: '2026-10-05T10:00:00.000Z' }),
  ],
  attachmentFolders: [],
  attachments: [],
}
const ctx = {
  users: [{ id: 'usr_a', username: 'mrossi', hostname: 'PC', displayName: 'Mario Rossi', role: 'admin' as const, createdAt: '2026-01-01T00:00:00.000Z' }],
  labels: [{ id: 'lbl_bug', name: 'Bug', color: '#d64545' }],
}

describe('export', () => {
  it('righe: ordine da fare per priorità, poi completati', () => {
    const rows = projectRows(project, ctx)
    expect(rows.map((r) => r.Titolo)).toEqual(['Login SPID', 'Export XBRL', 'Fatto'])
    expect(rows[1]!.Etichetta).toBe('Bug')
    expect(rows[1]!['Creato da']).toBe('Mario Rossi')
    expect(rows[2]!['Completato il']).toBe('2026-10-05')
  })

  it('CSV: BOM, punto e virgola, virgolette raddoppiate', () => {
    const csv = projectToCsv(project, ctx)
    expect(csv.startsWith('﻿Contenitore;Titolo;')).toBe(true)
    expect(csv).toContain('"con ""virgolette""; e punto e virgola"')
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(4)
  })

  it('safeFileName', () => {
    expect(safeFileName('Bilancio Europeo Web')).toBe('bilancio-europeo-web')
    expect(safeFileName('Città / Perù!')).toBe('citta-peru')
    expect(safeFileName('')).toBe('progetto')
  })
})
