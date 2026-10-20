import { describe, expect, it } from 'vitest'
import { setupScriptWindows, summarize } from './analytics'
import { EMPTY_STACK, type Item, type Project } from '@/types'

const item = (over: Partial<Item>): Item => ({
  id: Math.random().toString(36).slice(2), title: 'x', notes: '', priority: 'media', status: 'da_valutare', dueDate: null, labelId: null, assigneeId: null,
  bucket: 'todo', createdAt: '', createdBy: 'u1', completedAt: null, trashedAt: null, comments: [], questions: [], seq: 0, closedByCommit: null, blockedBy: [], milestoneId: null, estimateHours: null, checklist: [], confirmedAt: null, ...over,
})
const project = (name: string, items: Item[], trashedAt: string | null = null): Project =>
  ({ id: name, name, items, trashedAt, members: [], attachments: [], attachmentFolders: [], stack: EMPTY_STACK, aiTools: [] }) as unknown as Project

describe('summarize: riepilogo per gli admin', () => {
  const today = '2026-10-14'
  const p1 = project('A', [
    item({ status: 'confermato', priority: 'alta', dueDate: '2026-10-10', assigneeId: 'u1' }), // scaduto
    item({ status: 'da_definire', priority: 'immediata', dueDate: '2026-10-18', assigneeId: 'u1' }), // in scadenza
    item({ status: 'da_valutare', priority: 'bassa', assigneeId: null, questions: [{ id: 'q', authorId: 'u1', text: '?', mentions: [], createdAt: '', resolved: false, resolvedAt: null, answers: [], decision: null }] }),
    item({ bucket: 'done', assigneeId: 'u2' }),
    item({ bucket: 'trash' }),
  ])
  const p2 = project('B', [item({ priority: 'media', assigneeId: 'u2' })])
  const trashed = project('C', [item({})], '2026-10-01')
  const s = summarize([p1, p2, trashed], today)

  it('conta progetti, elementi per contenitore, stato e priorità (solo da fare)', () => {
    expect(s.projects).toEqual({ active: 2, trashed: 1, favorites: 0 })
    expect(s.items).toEqual({ todo: 4, done: 1, trash: 1 })
    expect(s.byStatus).toEqual({ da_valutare: 2, da_definire: 1, confermato: 1 })
    expect(s.byPriority).toEqual({ bassa: 1, media: 1, alta: 1, immediata: 1 })
  })
  it('scadenze e domande', () => {
    expect(s.overdue).toBe(1)
    expect(s.dueSoon).toBe(1)
    expect(s.withoutDue).toBe(2)
    expect(s.openQuestions).toBe(1)
  })
  it('carico per utente, non assegnati inclusi, ordinato per da fare', () => {
    expect(s.byUser.map((u) => [u.userId, u.todo, u.immediata, u.overdue, u.done])).toEqual([
      ['u1', 2, 1, 1, 0],
      ['u2', 1, 0, 0, 1],
      [null, 1, 0, 0, 0],
    ])
  })
  it('per progetto, il più carico prima; i cestinati esclusi', () => {
    expect(s.byProject.map((p) => [p.name, p.todo, p.done, p.trash, p.immediata, p.overdue])).toEqual([
      ['A', 3, 1, 1, 1, 1],
      ['B', 1, 0, 0, 0, 0],
    ])
  })
})

describe('setupScriptWindows', () => {
  it('genera uno script con verifiche, comandi in cartella, link e passi manuali', () => {
    const script = setupScriptWindows('Mio Progetto', {
      prerequisites: [{ name: 'Node.js', version: '20+', check: 'node -v', url: 'https://nodejs.org' }],
      steps: [
        { title: 'Dipendenze', kind: 'command', command: 'npm install\nnpm run build', cwd: 'Z:\\app', url: '', notes: 'ci vuole un minuto' },
        { title: 'Docs', kind: 'link', command: '', cwd: '', url: 'https://example.com', notes: '' },
        { title: 'Configura', kind: 'manual', command: '', cwd: '', url: '', notes: 'copia .env' },
      ],
      envVars: [{ key: 'API_URL', example: 'https://api' }],
    })
    expect(script).toContain('node -v || echo    MANCANTE: installa Node.js da https://nodejs.org')
    expect(script).toContain('pushd "Z:\\app"')
    expect(script).toContain('call npm install || goto fail')
    expect(script).toContain('call npm run build || goto fail')
    expect(script).toContain('start "" "https://example.com"')
    expect(script).toContain('API_URL=https://api')
    expect(script).toContain(':fail')
    expect(script.split('\r\n').length).toBeGreaterThan(20)
  })

  it('con la cartella del progetto, la crea se manca e ci si sposta prima dei comandi', () => {
    const script = setupScriptWindows('App', { prerequisites: [], steps: [{ title: 'Installa', kind: 'command', command: 'npm install', cwd: '', url: '', notes: '' }], envVars: [] }, { baseDir: 'D:\\Sviluppo\\App' })
    const lines = script.split('\r\n')
    const cd = lines.indexOf('cd /d "D:\\Sviluppo\\App" || goto fail')
    expect(lines).toContain('if not exist "D:\\Sviluppo\\App" mkdir "D:\\Sviluppo\\App"')
    expect(cd).toBeGreaterThan(0)
    expect(cd).toBeLessThan(lines.indexOf('call npm install || goto fail'))
  })
})
