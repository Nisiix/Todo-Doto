import { describe, expect, it } from 'vitest'
import { branchFromHead, branchName, closePhrase, closedSeqs, commitsBySeq, isActiveFromGit, mentionedSeqs, normalizeSeq, parseReflog, planGitClose, seqFromBranch, subjectOf, taskCode, type GitCommit } from './gitLink'
import type { Item, Project } from '@/types'

const item = (over: Partial<Item>): Item => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  title: 'x',
  notes: '',
  priority: 'media',
  status: 'da_valutare',
  dueDate: null,
  labelId: null,
  assigneeId: null,
  bucket: 'todo',
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: 'u1',
  completedAt: null,
  trashedAt: null,
  comments: [],
  questions: [],
  seq: 0,
  closedByCommit: null,
  confirmedAt: null,
  ...over,
})
const commit = (hash: string, message: string): GitCommit => ({ hash, author: 'Mario', date: '2026-10-15T10:00:00+02:00', message })

describe('codice del task e frase del commit', () => {
  it('codice TODO-n e frase in italiano e inglese', () => {
    expect(taskCode(12)).toBe('TODO-12')
    expect(closePhrase(12)).toBe('chiude TODO-12')
    expect(closePhrase(12, 'en')).toBe('closes TODO-12')
  })

  it('riconosce le parole di chiusura, anche più task e maiuscole/minuscole', () => {
    expect(closedSeqs('Export XBRL\n\nchiude TODO-12')).toEqual([12])
    expect(closedSeqs('fix: Closes todo-3, TODO-4 and TODO-5')).toEqual([3, 4, 5])
    expect(closedSeqs('risolve TODO-7 e TODO-8')).toEqual([7, 8])
    expect(closedSeqs('fixes: TODO-9')).toEqual([9])
    expect(closedSeqs('Merge: chiude TODO-2; poi chiude TODO-2 di nuovo')).toEqual([2])
  })

  it('una semplice citazione non chiude; codici diversi non contano', () => {
    expect(closedSeqs('lavoro su TODO-12')).toEqual([])
    expect(closedSeqs('chiude #12')).toEqual([])
    expect(closedSeqs('chiude BUG-12')).toEqual([])
    expect(closedSeqs('chiude TODO-0')).toEqual([])
    expect(closedSeqs('prefix: rechiude TODO-4')).toEqual([])
  })

  it('oggetto del commit: la prima riga non vuota', () => {
    expect(subjectOf('\n  Export XBRL  \n\ncorpo')).toBe('Export XBRL')
  })
})

describe('numerazione dei task', () => {
  it('numera in ordine di creazione i task senza numero, dopo il più alto, e allinea il contatore', () => {
    const p = {
      nextSeq: 0,
      items: [
        item({ id: 'b', createdAt: '2026-10-02T00:00:00.000Z' }),
        item({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z' }),
        item({ id: 'c', seq: 5 }),
      ],
    }
    expect(normalizeSeq(p)).toBe(true)
    expect(p.items.map((i) => [i.id, i.seq])).toEqual([['b', 7], ['a', 6], ['c', 5]])
    expect(p.nextSeq).toBe(8)
    expect(normalizeSeq(p)).toBe(false) // già a posto
  })

  it('il contatore non torna indietro: i numeri dei task eliminati non si riusano', () => {
    const p = { nextSeq: 20, items: [item({ seq: 3 })] }
    normalizeSeq(p)
    expect(p.nextSeq).toBe(20)
  })
})

describe('piano di chiusura dai commit', () => {
  const project = (over: Partial<Pick<Project, 'git'>> & { items: Item[] }) =>
    ({ git: { autoClose: true, handled: [], baselineDone: true }, ...over }) as Pick<Project, 'items' | 'git'>

  it('alla prima lettura i commit esistenti si segnano come visti senza chiudere nulla', () => {
    const p = project({ items: [item({ seq: 1 })], git: { autoClose: true, handled: [], baselineDone: false } })
    const plan = planGitClose(p, [commit('aaa111', 'chiude TODO-1'), commit('bbb222', 'altro')])
    expect(plan.close).toEqual([])
    expect(plan.handled).toEqual(['aaa111'])
  })

  it('chiude solo i task da fare, ogni commit una volta, il commit più vecchio vince', () => {
    const t1 = item({ id: 't1', seq: 1 })
    const t2 = item({ id: 't2', seq: 2, bucket: 'done' })
    const t3 = item({ id: 't3', seq: 3, bucket: 'trash' })
    const p = project({ items: [t1, t2, t3], git: { autoClose: true, handled: ['old999'], baselineDone: true } })
    // git log: il più recente per primo
    const plan = planGitClose(p, [commit('new222', 'fixes TODO-1'), commit('mid111', 'chiude TODO-1, TODO-2, TODO-3, TODO-99'), commit('old999', 'chiude TODO-1')])
    expect(plan.close.map((c) => [c.item.id, c.commit.hash])).toEqual([['t1', 'mid111']])
    expect(plan.handled).toEqual(['mid111', 'new222'])
  })

  it('un task riaperto a mano non viene richiuso dallo stesso commit', () => {
    const p = project({ items: [item({ seq: 4 })], git: { autoClose: true, handled: ['c0ffee'], baselineDone: true } })
    expect(planGitClose(p, [commit('c0ffee', 'chiude TODO-4')]).close).toEqual([])
  })
})

describe('reflog (quando git non è installato)', () => {
  it('legge i commit dal reflog, il più recente per primo, ignorando checkout e merge', () => {
    const z = '0'.repeat(40)
    const a = 'a'.repeat(40)
    const b = 'b'.repeat(40)
    const text = [
      `${z} ${a} Mario Rossi <mario@x.it> 1760515200 +0200\tcommit (initial): Primo`,
      `${a} ${a} Mario Rossi <mario@x.it> 1760515300 +0200\tcheckout: moving from main to dev`,
      `${a} ${b} Anna <anna@x.it> 1760515400 +0200\tcommit: chiude TODO-3`,
    ].join('\n')
    const c = parseReflog(text)
    expect(c.map((x) => [x.hash.slice(0, 1), x.author, x.message])).toEqual([
      ['b', 'Anna', 'chiude TODO-3'],
      ['a', 'Mario Rossi', 'Primo'],
    ])
    expect(c[0]!.date).toBe(new Date(1760515400 * 1000).toISOString())
  })
})

describe('attività git per task', () => {
  it('menzioni: tutti i codici citati, anche senza parola di chiusura', () => {
    expect(mentionedSeqs('TODO-12 primo passo, vedi anche todo-3')).toEqual([12, 3])
    expect(mentionedSeqs('niente qui, TODO-0 non vale')).toEqual([])
  })

  it('nome del branch: minuscole, senza accenti, tagliato su un trattino', () => {
    expect(branchName(12, 'Esportazione dei dati in CSV')).toBe('todo-12-esportazione-dei-dati-in-csv')
    expect(branchName(3, 'Perché l’app è lenta?\nDettagli')).toBe('todo-3-perche-l-app-e-lenta')
    expect(branchName(7, '!!!')).toBe('todo-7')
    const long = branchName(1, 'Una descrizione molto lunga che supera di parecchio il limite dei quaranta caratteri')
    expect(long).toBe('todo-1-una-descrizione-molto-lunga-che-supera')
    expect(long.length).toBeLessThanOrEqual(47)
  })

  it('numero del task dal branch e branch da .git/HEAD', () => {
    expect(seqFromBranch('todo-12-esportazione')).toBe(12)
    expect(seqFromBranch('feature/TODO-4')).toBe(4)
    expect(seqFromBranch('mytodo-4')).toBeNull()
    expect(seqFromBranch('main')).toBeNull()
    expect(branchFromHead('ref: refs/heads/todo-12-csv\n')).toBe('todo-12-csv')
    expect(branchFromHead('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBeNull()
  })

  it('commit per task e «in lavorazione»', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')
    const commits = [
      { hash: 'c3', author: 'Anna', date: '2026-10-19T10:00:00Z', message: 'TODO-5 bozza della pagina' },
      { hash: 'c2', author: 'Anna', date: '2026-10-10T10:00:00Z', message: 'chiude TODO-4, vedi TODO-5' },
      { hash: 'c1', author: 'Mario', date: '2026-10-01T10:00:00Z', message: 'commit iniziale' },
    ]
    const by = commitsBySeq(commits)
    expect(by.get(5)!.map((t) => [t.commit.hash, t.closes])).toEqual([['c3', false], ['c2', false]])
    expect(by.get(4)!.map((t) => [t.commit.hash, t.closes])).toEqual([['c2', true]])
    expect(isActiveFromGit(5, by.get(5), null, now)).toBe(true)
    expect(isActiveFromGit(4, by.get(4), null, now)).toBe(false) // solo la chiusura, e vecchia
    expect(isActiveFromGit(9, undefined, 'todo-9-login', now)).toBe(true)
    expect(isActiveFromGit(9, undefined, 'main', now)).toBe(false)
  })
})
