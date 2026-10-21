/**
 * «Chiedi al progetto» (0.7.0): una domanda in linguaggio naturale sul
 * progetto («cosa abbiamo deciso sull'autenticazione?», «cosa manca
 * all'export?»). Si cercano per significato i passaggi più vicini fra task,
 * commenti, domande e decisioni, documento di architettura, note dello Stack e
 * allegati di testo o PDF; al modello locale vanno SOLO quei passaggi
 * (ripuliti dai segreti) e la risposta cita le fonti, che si aprono con un clic.
 */
import { z } from 'zod'
import dayjs from 'dayjs'
import { chatJson } from './localAi'
import { redactSecrets } from './aiStack'
import { firstLine } from './items'
import { taskCode } from './gitLink'
import type { ExtractedPage } from './textExtract'
import { STATUS_LABEL, type AiConfig, type Item, type Project } from '@/types'
import { DATE, locale } from '@/i18n'

const LANG = locale === 'en' ? 'English' : 'italiano'
const L =
  locale === 'en'
    ? {
        comments: (c: string) => `Comments on ${c}`,
        question: (c: string, d: string) => `Question on ${c} (${d})`,
        decision: (c: string, d: string) => `Decision on ${c} (${d})`,
        notes: 'Stack notes',
        status: 'Status',
        done: 'completed',
        assignee: 'Assignee',
        due: 'Due',
        answer: 'Answer',
        chosen: 'Chosen answer',
        why: 'Rationale',
        page: (n: number) => `p. ${n}`,
      }
    : {
        comments: (c: string) => `Commenti a ${c}`,
        question: (c: string, d: string) => `Domanda su ${c} (${d})`,
        decision: (c: string, d: string) => `Decisione su ${c} (${d})`,
        notes: 'Note dello Stack',
        status: 'Stato',
        done: 'completato',
        assignee: 'Responsabile',
        due: 'Scadenza',
        answer: 'Risposta',
        chosen: 'Risposta scelta',
        why: 'Motivazione',
        page: (n: number) => `p. ${n}`,
      }

export type PassageKind = 'task' | 'comments' | 'question' | 'decision' | 'doc' | 'notes' | 'attachment'

export interface Passage {
  id: string
  kind: PassageKind
  /** Come si cita la fonte: «TODO-12 Pagina di accesso», «ARCHITETTURA.md › Accesso», «manuale.pdf, p. 3». */
  label: string
  text: string
  itemId?: string
  attachmentId?: string
}

/** Lunghezza massima di un passaggio (caratteri): abbastanza per un paragrafo, poco per l'indice. */
export const CHUNK = 1200

/** Divide un testo lungo in pezzi, preferendo le righe vuote e poi le frasi. */
export function chunkText(text: string, max = CHUNK): string[] {
  const t = text.replace(/\r\n/g, '\n').trim()
  if (t.length <= max) return t ? [t] : []
  const out: string[] = []
  let cur = ''
  const flush = () => {
    if (cur.trim()) out.push(cur.trim())
    cur = ''
  }
  for (const para of t.split(/\n\s*\n/)) {
    if (cur && cur.length + para.length + 2 > max) flush()
    if (para.length <= max) {
      cur = cur ? `${cur}\n\n${para}` : para
      continue
    }
    // Paragrafo troppo lungo: per frasi, e se serve a pezzi fissi
    for (const sentence of para.split(/(?<=[.!?;])\s+/)) {
      if (cur && cur.length + sentence.length + 1 > max) flush()
      if (sentence.length <= max) cur = cur ? `${cur} ${sentence}` : sentence
      else for (let i = 0; i < sentence.length; i += max) out.push(sentence.slice(i, i + max))
    }
  }
  flush()
  return out
}

/** Sezioni di un documento Markdown (titolo del capitolo più vicino → testo). */
export function markdownSections(md: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = []
  let heading = ''
  let buf: string[] = []
  const push = () => {
    const text = buf.join('\n').trim()
    if (text) out.push({ heading, text })
    buf = []
  }
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^#{1,4}\s+(.+?)\s*#*$/.exec(line)
    if (h) {
      push()
      heading = h[1]!.trim()
    } else buf.push(line)
  }
  push()
  return out
}

const codeOf = (i: Item) => (i.seq ? taskCode(i.seq) : firstLine(i.title).slice(0, 40))
const labelOf = (i: Item) => [i.seq ? taskCode(i.seq) : '', firstLine(i.title)].filter(Boolean).join(' ')
const day = (iso: string) => dayjs(iso).format(DATE.date)

export interface PassageContext {
  userName: (id: string | null | undefined) => string
  /** Testo degli allegati già letto (id dell'allegato → pagine). */
  attachments?: Record<string, ExtractedPage[]>
}

/** Tutti i passaggi in cui cercare, dal contenuto del progetto. */
export function projectPassages(p: Project, ctx: PassageContext): Passage[] {
  const out: Passage[] = []
  const add = (x: Omit<Passage, 'id' | 'text'>, text: string) => chunkText(text).forEach((t, n) => out.push({ ...x, id: `${x.kind}:${x.itemId ?? x.attachmentId ?? ''}:${x.label}:${n}`, text: t }))
  for (const i of p.items) {
    if (i.bucket === 'trash') continue
    const facts = [
      `${L.status}: ${i.bucket === 'done' ? L.done : STATUS_LABEL[i.status]}`,
      i.assigneeId ? `${L.assignee}: ${ctx.userName(i.assigneeId)}` : '',
      i.dueDate ? `${L.due}: ${day(i.dueDate)}` : '',
    ].filter(Boolean)
    const checklist = i.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join('\n')
    add({ kind: 'task', label: labelOf(i), itemId: i.id }, [labelOf(i), facts.join(' · '), i.notes, checklist].filter(Boolean).join('\n'))
    if (i.comments.length)
      add({ kind: 'comments', label: L.comments(codeOf(i)), itemId: i.id }, i.comments.map((c) => `${ctx.userName(c.authorId)} (${day(c.createdAt)}): ${c.text}`).join('\n\n'))
    for (const q of i.questions) {
      const chosen = q.decision ? q.answers.find((a) => a.id === q.decision!.answerId) : undefined
      const lines = [`${ctx.userName(q.authorId)}: ${q.text}`]
      if (chosen) {
        lines.push(`${L.chosen} (${ctx.userName(chosen.authorId)}): ${chosen.text}`)
        if (q.decision!.rationale) lines.push(`${L.why}: ${q.decision!.rationale}`)
      }
      for (const a of q.answers) if (a !== chosen) lines.push(`${L.answer} (${ctx.userName(a.authorId)}): ${a.text}`)
      const decided = !!(chosen && q.decision)
      add({ kind: decided ? 'decision' : 'question', label: decided ? L.decision(codeOf(i), day(q.decision!.at)) : L.question(codeOf(i), day(q.createdAt)), itemId: i.id }, lines.join('\n'))
    }
  }
  if (p.stack.doc)
    for (const s of markdownSections(p.stack.doc.content)) add({ kind: 'doc', label: s.heading ? `${p.stack.doc.fileName} › ${s.heading}` : p.stack.doc.fileName }, s.text)
  if (p.stack.notes.trim()) add({ kind: 'notes', label: L.notes }, p.stack.notes)
  for (const a of p.attachments) {
    const pages = ctx.attachments?.[a.id]
    if (!pages) continue
    for (const pg of pages) add({ kind: 'attachment', label: pg.page ? `${a.name}, ${L.page(pg.page)}` : a.name, attachmentId: a.id }, pg.text)
  }
  return out
}

/** Testo da indicizzare: l'etichetta aiuta a ritrovare il passaggio («export», «TODO-12»). */
export const passageText = (x: Passage) => redactSecrets(`${x.label}\n${x.text}`).slice(0, 2000)

/** Codici dei task citati nella domanda («TODO-12»): quei task si includono sempre. */
export const mentionedSeqs = (question: string) => [...question.matchAll(/\btodo-(\d+)\b/gi)].map((m) => Number(m[1]))

// ---------------------------------------------------------------------------

export const ASK_THRESHOLD = 0.5
export const ASK_MAX = 8

const AnswerSchema = z.object({ answer: z.string(), sources: z.array(z.number()).default([]), found: z.boolean().default(true) })

export interface ProjectAnswer {
  answer: string
  /** Passaggi dati al modello, numerati da 1 come nella risposta ([1], [2]…). */
  passages: Passage[]
  /** Numeri delle fonti citate, in ordine. */
  cited: number[]
  /** Il progetto non contiene la risposta. */
  notFound: boolean
}

/** Risposta del modello locale dai passaggi trovati (al massimo ASK_MAX). */
export async function answerFromPassages(cfg: AiConfig, projectName: string, question: string, passages: Passage[]): Promise<ProjectAnswer> {
  const list = passages.slice(0, ASK_MAX)
  const system = `Rispondi in ${LANG} a una domanda sul progetto software «${projectName}» usando SOLO i passaggi numerati forniti (task, commenti, domande e decisioni, documenti). Cita le fonti con il loro numero tra parentesi quadre, es. [2]. Se i passaggi non contengono la risposta, dillo chiaramente e metti "found": false; niente di inventato. Tono diretto, massimo 8 frasi o un elenco breve. Rispondi solo con JSON.`
  const user = `DOMANDA: ${redactSecrets(question).slice(0, 500)}\n\nPASSAGGI:\n${list.map((x, n) => `[${n + 1}] ${passageText(x)}`).join('\n\n')}`
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'sources', 'found'],
    properties: { answer: { type: 'string', maxLength: 2500 }, sources: { type: 'array', items: { type: 'integer' }, maxItems: ASK_MAX }, found: { type: 'boolean' } },
  }
  const r = await chatJson(cfg, { system, user, schema, validate: AnswerSchema, timeoutMs: 240_000, numCtx: 8192 })
  // Fonti: quelle citate nel testo e quelle dichiarate, valide e senza doppioni
  const nums = [...[...r.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])), ...r.sources]
  const cited = [...new Set(nums)].filter((n) => n >= 1 && n <= list.length).sort((a, b) => a - b)
  return { answer: r.answer.trim().slice(0, 2500), passages: list, cited, notFound: !r.found }
}

