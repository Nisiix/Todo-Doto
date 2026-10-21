import { afterEach, describe, expect, it } from 'vitest'
import { answerFromPassages, chunkText, markdownSections, mentionedSeqs, passageText, projectPassages, type Passage } from './askProject'
import { textKey, VectorIndex } from './vectorIndex'
import { getFs } from './fs'
import type { AiHttpRequest } from './localAi'
import { DEFAULT_AI_CONFIG, EMPTY_STACK, ProjectSchema } from '@/types'

const cfg = { ...DEFAULT_AI_CONFIG, enabled: true }
const T = '2026-10-03T09:00:00.000Z'

describe('testo a pezzi', () => {
  it('un testo corto resta intero; uno lungo si divide sui paragrafi e poi sulle frasi', () => {
    expect(chunkText('  breve  ')).toEqual(['breve'])
    expect(chunkText('')).toEqual([])
    const para = (c: string) => `${c.repeat(50)}.`
    const parts = chunkText([para('a'), para('b'), para('c')].join('\n\n'), 110)
    expect(parts).toEqual([`${para('a')}\n\n${para('b')}`, para('c')])
    const long = Array.from({ length: 10 }, (_, i) => `Frase ${i} ${'x'.repeat(20)}.`).join(' ')
    expect(chunkText(long, 70).every((p) => p.length <= 70)).toBe(true)
    expect(chunkText('y'.repeat(250), 100)).toHaveLength(3)
  })
  it('sezioni di un Markdown', () => {
    expect(markdownSections('Intro\n\n# Accesso\nSSO con Entra ID\n## Dettagli ##\nToken di 1 ora\n# Vuoto\n')).toEqual([
      { heading: '', text: 'Intro' },
      { heading: 'Accesso', text: 'SSO con Entra ID' },
      { heading: 'Dettagli', text: 'Token di 1 ora' },
    ])
  })
  it('codici dei task nella domanda', () => {
    expect(mentionedSeqs('cosa manca a TODO-12 e todo-3?')).toEqual([12, 3])
  })
})

describe('passaggi del progetto', () => {
  const p = ProjectSchema.parse({
    id: 'p',
    name: 'Portale',
    createdAt: T,
    createdBy: 'u1',
    updatedAt: T,
    updatedBy: 'u1',
    items: [
      {
        id: 'i1', seq: 12, title: 'Accesso con SSO\naltro', notes: 'Con Entra ID', status: 'confermato', dueDate: '2026-11-20', assigneeId: 'u2', createdAt: T, createdBy: 'u1',
        checklist: [{ id: 'c', text: 'Registrare l’app', done: true }],
        comments: [{ id: 'k', authorId: 'u2', text: 'Serve il tenant id', createdAt: T }],
        questions: [
          { id: 'q1', authorId: 'u1', text: 'SAML o OIDC?', createdAt: T, answers: [{ id: 'a1', authorId: 'u2', text: 'OIDC', createdAt: T }, { id: 'a2', authorId: 'u3', text: 'SAML', createdAt: T }], decision: { answerId: 'a1', rationale: 'più semplice', at: T, by: 'u1' } },
          { id: 'q2', authorId: 'u1', text: 'Chi registra l’app?', createdAt: T },
        ],
      },
      { id: 'i2', seq: 13, title: 'Vecchio', bucket: 'trash', createdAt: T, createdBy: 'u1' },
    ],
    stack: { ...EMPTY_STACK, notes: 'Usare Node 22', doc: { fileName: 'ARCHITETTURA.md', content: '# Accesso\nOIDC con PKCE', importedAt: T } },
    attachments: [
      { id: 'att1', kind: 'file', name: 'manuale.pdf', target: '/x/manuale.pdf', addedBy: 'u1', addedAt: T },
      { id: 'att2', kind: 'file', name: 'non-letto.md', target: '/x/n.md', addedBy: 'u1', addedAt: T },
    ],
  })
  const names: Record<string, string> = { u1: 'Anna', u2: 'Mario', u3: 'Luca' }
  const list = projectPassages(p, { userName: (id) => (id ? names[id] ?? '?' : '—'), attachments: { att1: [{ page: 3, text: 'Il login usa PKCE' }] } })
  const of = (kind: Passage['kind']) => list.filter((x) => x.kind === kind)

  it('task con stato, responsabile, scadenza e lista; il cestino no', () => {
    expect(of('task')).toHaveLength(1)
    expect(of('task')[0]).toMatchObject({ label: 'TODO-12 Accesso con SSO', itemId: 'i1' })
    expect(of('task')[0]!.text).toContain('Stato: Confermato · Responsabile: Mario · Scadenza: 20 nov 2026')
    expect(of('task')[0]!.text).toContain('[x] Registrare l’app')
  })
  it('commenti, decisioni con la risposta scelta, domande aperte', () => {
    expect(of('comments')[0]).toMatchObject({ label: 'Commenti a TODO-12', text: 'Mario (3 ott 2026): Serve il tenant id' })
    expect(of('decision')[0]!.label).toBe('Decisione su TODO-12 (3 ott 2026)')
    expect(of('decision')[0]!.text).toBe('Anna: SAML o OIDC?\nRisposta scelta (Mario): OIDC\nMotivazione: più semplice\nRisposta (Luca): SAML')
    expect(of('question')[0]!.label).toBe('Domanda su TODO-12 (3 ott 2026)')
  })
  it('documento per capitoli, note dello Stack, allegati letti con la pagina', () => {
    expect(of('doc')[0]).toMatchObject({ label: 'ARCHITETTURA.md › Accesso', text: 'OIDC con PKCE' })
    expect(of('notes')[0]!.text).toBe('Usare Node 22')
    expect(of('attachment')).toEqual([expect.objectContaining({ label: 'manuale.pdf, p. 3', attachmentId: 'att1' })])
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length)
  })
  it('il testo da indicizzare porta l’etichetta e non i segreti', () => {
    expect(passageText({ id: 'x', kind: 'notes', label: 'Note', text: 'DB: postgres://admin:segreto@db/app' })).toBe('Note\nDB: postgres://***@db/app')
  })
})

describe('risposta', () => {
  afterEach(() => Object.assign(window, { __pgmAi: undefined }))
  const passages: Passage[] = [1, 2, 3].map((n) => ({ id: `p${n}`, kind: 'task', label: `TODO-${n}`, text: `testo ${n}`, itemId: `i${n}` }))
  function model(answer: unknown) {
    const sent: string[] = []
    Object.assign(window, {
      __pgmAi: {
        request(req: AiHttpRequest) {
          sent.push(req.body ?? '')
          return { status: 200, body: JSON.stringify({ message: { content: JSON.stringify(answer) } }) }
        },
      },
    })
    return sent
  }
  it('fonti citate nel testo e dichiarate, valide e senza doppioni', async () => {
    const sent = model({ answer: 'Si usa OIDC [2], deciso a ottobre [2][9].', sources: [3, 0], found: true })
    const r = await answerFromPassages(cfg, 'Portale', 'cosa usiamo?', passages)
    expect(r).toMatchObject({ cited: [2, 3], notFound: false })
    expect(r.passages).toHaveLength(3)
    expect(sent[0]).toContain('[1] TODO-1')
  })
  it('il progetto non contiene la risposta', async () => {
    model({ answer: 'Non risulta dai dati.', sources: [], found: false })
    expect(await answerFromPassages(cfg, 'Portale', '?', passages)).toMatchObject({ cited: [], notFound: true })
  })
})

describe('indice degli embedding', () => {
  it('impronte diverse per testi diversi, uguali per lo stesso testo', () => {
    expect(textKey('abc')).toBe(textKey('abc'))
    expect(textKey('abc')).not.toBe(textKey('abd'))
  })
  it('si salva sul PC e si rilegge; con un altro modello riparte vuoto; senza persistenza niente file', async () => {
    const a = await VectorIndex.open('ws_1', 'ollama|nomic', true)
    a.set('ciao', [0.5, -1, 2])
    await a.save()
    const b = await VectorIndex.open('ws_1', 'ollama|nomic', true)
    expect(b.get('ciao')).toEqual([0.5, -1, 2])
    expect((await VectorIndex.open('ws_1', 'ollama|altro', true)).size).toBe(0)
    const mem = await VectorIndex.open('ws_2', 'ollama|nomic', false)
    mem.set('x', [1])
    await mem.save()
    const fs = await getFs()
    expect(await fs.readDir(await fs.join(await fs.appDataDir(), 'ia'))).toEqual(['indice-ws_1.json'])
  })
})
