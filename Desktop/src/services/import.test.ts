import { describe, expect, it } from 'vitest'
import { detectDelimiter, importAny, importFromCsv, importFromTrello, parseCsv, parseDate, parsePriority, summarize } from './import'
import { projectToCsv } from './export'
import type { Project } from '@/types'

describe('import CSV', () => {
  it('riconosce il separatore e le virgolette', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(parseCsv('﻿Titolo;Note\r\n"Con; punto";"a ""b"" c"\r\nX;\r\n')).toEqual([
      ['Titolo', 'Note'],
      ['Con; punto', 'a "b" c'],
      ['X', ''],
    ])
  })

  it('mappa le colonne in italiano e in inglese, con date in più formati', () => {
    const r = importFromCsv('Title,Description,Priority,Status,Due date,Label\nFix login,desc,High,In progress,2026-11-30,Bug\nLow one,,low,,30/11/2026,\nNo date,,urgent,confirmed,domani,')
    expect(r.items).toHaveLength(3)
    expect(r.items[0]).toMatchObject({ title: 'Fix login', notes: 'desc', priority: 'alta', status: 'confermato', dueDate: '2026-11-30', label: 'Bug', bucket: 'todo' })
    expect(r.items[1]).toMatchObject({ priority: 'bassa', dueDate: '2026-11-30', label: null })
    expect(r.items[2]).toMatchObject({ priority: 'immediata', status: 'confermato', dueDate: null })
    expect(r.warnings[0]).toMatch(/Data non riconosciuta/)
    expect(r.labels).toEqual([{ name: 'Bug', color: expect.any(String) }])
  })

  it('senza intestazione usa la prima colonna come titolo', () => {
    const r = importFromCsv('Comprare il latte\nChiamare Mario\n')
    expect(r.items.map((i) => i.title)).toEqual(['Comprare il latte', 'Chiamare Mario'])
    expect(r.warnings[0]).toMatch(/Nessuna colonna/)
  })

  it('il nostro export CSV si reimporta (contenitori compresi)', () => {
    const item = (t: string, bucket: 'todo' | 'done' | 'trash') => ({
      id: 'itm_' + t,
      title: t,
      notes: 'n',
      priority: 'alta' as const,
      status: 'confermato' as const,
      dueDate: '2026-12-01',
      labelId: 'lbl_1',
      bucket,
      createdAt: '2026-10-01T00:00:00.000Z',
      createdBy: 'u',
      completedAt: bucket === 'done' ? '2026-10-02T00:00:00.000Z' : null,
      trashedAt: null,
      comments: [],
      questions: [],
    })
    const p = { id: 'p', name: 'P', items: [item('A', 'todo'), item('B', 'done'), item('C', 'trash')] } as unknown as Project
    const csv = projectToCsv(p, { users: [], labels: [{ id: 'lbl_1', name: 'Bug', color: '#000' }] })
    const r = importFromCsv(csv)
    expect(r.items.map((i) => [i.title, i.bucket, i.priority, i.status, i.dueDate, i.label])).toEqual([
      ['A', 'todo', 'alta', 'confermato', '2026-12-01', 'Bug'],
      ['B', 'done', 'alta', 'confermato', '2026-12-01', 'Bug'],
      ['C', 'trash', 'alta', 'confermato', '2026-12-01', 'Bug'],
    ])
    expect(summarize(r)).toBe('1 da fare · 1 completati · 1 nel cestino · 3 con scadenza')
  })

  it('parseDate e parsePriority', () => {
    expect(parseDate('2026-01-05T10:00:00.000Z')).toBe('2026-01-05')
    expect(parseDate('5/1/2026')).toBe('2026-01-05')
    expect(parseDate('05.01.2026')).toBe('2026-01-05')
    expect(parseDate('')).toBeNull()
    expect(parsePriority('Immediata')).toBe('immediata')
    expect(parsePriority('')).toBe('media')
  })
})

describe('import Trello', () => {
  const board = {
    name: 'Sito web',
    lists: [
      { id: 'l1', name: 'To Do' },
      { id: 'l2', name: 'In corso' },
      { id: 'l3', name: 'Done' },
      { id: 'l4', name: 'Vecchie', closed: true },
    ],
    cards: [
      { name: 'Login', desc: 'con SPID', due: '2026-11-30T12:00:00.000Z', idList: 'l1', labels: [{ name: 'Urgente', color: 'red' }] },
      { name: 'Export', idList: 'l2', labels: [{ name: 'Alta priorità', color: 'orange' }, { name: 'Cliente', color: 'purple' }] },
      { name: 'Template', idList: 'l3', dueComplete: true },
      { name: 'Chat', idList: 'l1', closed: true },
      { name: 'Antica', idList: 'l4' },
    ],
  }

  it('mappa liste, etichette, scadenze e stato', () => {
    const r = importFromTrello(board)
    expect(r.name).toBe('Sito web')
    expect(r.items.map((i) => [i.title, i.bucket, i.priority, i.status, i.dueDate, i.label])).toEqual([
      ['Login', 'todo', 'immediata', 'da_valutare', '2026-11-30', 'Urgente'],
      ['Export', 'todo', 'alta', 'confermato', null, 'Alta priorità'],
      ['Template', 'done', 'media', 'da_valutare', null, null],
      ['Chat', 'trash', 'media', 'da_valutare', null, null],
      ['Antica', 'trash', 'media', 'da_valutare', null, null],
    ])
    expect(r.items[0]!.notes).toBe('con SPID')
    expect(r.labels).toEqual([
      { name: 'Urgente', color: '#d64545' },
      { name: 'Alta priorità', color: '#e07a3f' },
    ])
  })

  it('importAny riconosce JSON e CSV, e segnala i file non validi', () => {
    expect(importAny(JSON.stringify(board)).source).toBe('trello')
    expect(importAny('Titolo\nA').source).toBe('csv')
    expect(importAny('{"ciao": 1}').warnings[0]).toMatch(/Trello/)
    expect(importAny('{non json').warnings[0]).toMatch(/non è leggibile/)
  })
})
