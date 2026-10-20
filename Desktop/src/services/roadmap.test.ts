import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { buildRoadmapHtml, defaultRoadmapOptions, roadmapSections } from './roadmap'
import { ItemSchema, ProjectSchema, type Item } from '@/types'

const now = dayjs('2026-10-20T10:00:00')
const item = (over: Partial<Item> & { title: string }): Item =>
  ItemSchema.parse({ id: `itm_${over.title.length}_${Math.random().toString(36).slice(2, 6)}`, createdAt: '2026-09-01T10:00:00.000Z', createdBy: 'usr_1', ...over })

const project = ProjectSchema.parse({
  schema: 1,
  id: 'prj_1',
  name: 'Sito Rossi & Figli',
  description: 'Rifacimento del sito',
  version: 1,
  createdAt: '2026-09-01T10:00:00.000Z',
  createdBy: 'usr_1',
  updatedAt: '2026-09-01T10:00:00.000Z',
  updatedBy: 'usr_1',
  items: [
    item({ title: 'Pagina contatti\nnote interne: password del cliente in chat', status: 'confermato', dueDate: '2026-11-05', labelId: 'lbl_web', assigneeId: 'usr_2', notes: 'SEGRETO' }),
    item({ title: 'Menu mobile', status: 'confermato', dueDate: '2026-10-28' }),
    item({ title: 'Blog', status: 'da_definire' }),
    item({ title: 'Idea: chatbot', status: 'da_valutare' }),
    item({ title: 'Logo nuovo', bucket: 'done', status: 'confermato', completedAt: '2026-10-10T10:00:00.000Z' }),
    item({ title: 'Vecchio audit', bucket: 'done', completedAt: '2026-01-10T10:00:00.000Z', status: 'confermato' }),
    item({ title: 'Cestinato', bucket: 'trash' }),
  ],
})
project.items[0]!.comments.push({ id: 'c1', authorId: 'usr_1', text: 'commento interno', createdAt: '2026-09-02T10:00:00.000Z' } as never)

const ctx = { labels: { lbl_web: { id: 'lbl_web', name: 'Web', color: '#3366ff' } }, userName: (id: string) => (id === 'usr_2' ? 'Marco' : '?'), now }

describe('roadmap per il cliente', () => {
  it('divide in pianificato (per data), da pianificare e completati recenti; le idee da valutare e il cestino restano fuori', () => {
    const s = roadmapSections(project, defaultRoadmapOptions(project), now)
    expect(s.planned.map((i) => i.title.split('\n')[0])).toEqual(['Menu mobile', 'Pagina contatti'])
    expect(s.undated.map((i) => i.title)).toEqual(['Blog'])
    expect(s.done.map((i) => i.title)).toEqual(['Logo nuovo']) // ultimi 90 giorni
    expect(s.total).toBe(5) // senza «da valutare» e cestino
    expect(s.completed).toBe(2)
  })

  it('la pagina contiene solo la prima riga dei titoli: niente descrizioni, commenti, assegnatari (se non richiesti)', () => {
    const html = buildRoadmapHtml(project, defaultRoadmapOptions(project), ctx)
    expect(html).toContain('Pagina contatti')
    expect(html).not.toContain('password')
    expect(html).not.toContain('SEGRETO')
    expect(html).not.toContain('commento interno')
    expect(html).not.toContain('Marco')
    expect(html).not.toContain('chatbot')
    expect(html).not.toContain('<script')
    expect(html).toContain('Sito Rossi &amp; Figli') // testo protetto
    expect(html).toContain('40%')
    expect(buildRoadmapHtml(project, { ...defaultRoadmapOptions(project), showAssignees: true }, ctx)).toContain('Marco')
  })

  it('filtri: solo un’etichetta, idee da valutare incluse su richiesta, tutti i completati', () => {
    const o = { ...defaultRoadmapOptions(project), labelIds: ['lbl_web'] }
    expect(roadmapSections(project, o, now).planned).toHaveLength(1)
    const all = roadmapSections(project, { ...defaultRoadmapOptions(project), includeTriage: true, doneSinceDays: null }, now)
    expect(all.undated.map((i) => i.title)).toContain('Idea: chatbot')
    expect(all.done).toHaveLength(2)
  })
})
