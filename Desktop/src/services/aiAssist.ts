/**
 * Funzioni assistite dall'IA locale (oltre all'analisi dello Stack). Tutte:
 * - girano solo se l'IA locale è attiva su questo PC (chi chiama usa withAi);
 * - ricevono il minimo indispensabile, ripulito dai segreti;
 * - restituiscono PROPOSTE che l'utente conferma: nessuna scrittura automatica.
 */
import { z } from 'zod'
import { chatJson, cosine, embed } from './localAi'
import { redactSecrets } from './aiStack'
import { closedSeqs, subjectOf, taskCode, type GitCommit } from './gitLink'
import { firstLine } from './items'
import { PRIORITIES, type AiConfig, type Item, type Priority, type Stack } from '@/types'
import { locale } from '@/i18n'

const LANG = locale === 'en' ? 'English' : 'italiano'
const str = (max: number) => ({ type: 'string', maxLength: max })
const arr = (items: unknown, max: number) => ({ type: 'array', items, maxItems: max })
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)

// ---------------------------------------------------------------------------
// 1. Perché la verifica di un prerequisito non va, e come sistemarla
// ---------------------------------------------------------------------------

export interface CheckHelpInput {
  name: string
  required: string
  command: string
  output: string
  status: string
  note?: string
  os: string
}
const CheckHelpSchema = z.object({ summary: z.string(), steps: z.array(z.string()).default([]), commands: z.array(z.string()).default([]) })
export type CheckHelp = z.infer<typeof CheckHelpSchema>

/** Comandi da non proporre mai (cancellazioni, formattazioni, esecuzione di script scaricati…). */
const DANGEROUS = /\b(rm|rmdir|del|erase|rd|format|diskpart|shutdown|reg\s+delete|remove-item|clear-disk|mkfs|dd|chmod\s+-R|chown\s+-R)\b|\|\s*(sh|bash|iex|invoke-expression|powershell|cmd)\b|\biex\b|invoke-expression|curl[^|]*\|\s*\w|>\s*\S/i
export const isSafeSuggestion = (cmd: string) => !!cmd.trim() && cmd.length <= 200 && !DANGEROUS.test(cmd)

export async function explainCheck(cfg: AiConfig, x: CheckHelpInput): Promise<CheckHelp> {
  const system = `Sei un tecnico che aiuta a configurare il PC di sviluppo. Spiega in ${LANG}, in modo semplice e breve, perché la verifica di un programma non è andata a buon fine e come sistemarla sul sistema indicato. Proponi solo installazioni o aggiornamenti dal sito ufficiale o dal gestore di pacchetti del sistema (es. winget su Windows). Mai comandi che cancellano, formattano o eseguono script scaricati. Rispondi solo con JSON.`
  const user = [
    `Programma: ${x.name}`,
    `Versione richiesta: ${x.required || 'qualsiasi'}`,
    `Sistema: ${x.os}`,
    `Esito: ${x.status}${x.note ? ` (${x.note})` : ''}`,
    `Comando di verifica: ${x.command}`,
    `Output:\n${redactSecrets(x.output).slice(0, 2000)}`,
  ].join('\n')
  const schema = obj({ summary: str(500), steps: arr(str(200), 6), commands: arr(str(200), 4) })
  const r = await chatJson(cfg, { system, user, schema, validate: CheckHelpSchema, timeoutMs: 120_000, numCtx: 4096 })
  return { summary: clip(r.summary, 500), steps: r.steps.map((s) => clip(s, 200)).filter(Boolean).slice(0, 6), commands: r.commands.map((c) => c.trim()).filter(isSafeSuggestion).slice(0, 4) }
}

// ---------------------------------------------------------------------------
// 2. Da un testo (appunti, mail, verbale) ai task proposti
// ---------------------------------------------------------------------------

const TasksSchema = z.object({
  tasks: z.array(z.object({ title: z.string(), notes: z.string().default(''), priority: z.enum(PRIORITIES).catch('media') })).default([]),
})
export interface ProposedTask {
  title: string
  notes: string
  priority: Priority
}

export async function tasksFromText(cfg: AiConfig, text: string, existingTitles: string[] = []): Promise<ProposedTask[]> {
  const system = `Dal testo dell'utente (appunti, una mail, un verbale) ricavi le cose da fare per un progetto software, come task. Regole: un task per ogni attività concreta; titolo breve e operativo (max 80 caratteri); nella descrizione i dettagli utili presi dal testo; priorità tra ${PRIORITIES.join(', ')} ("immediata" solo se il testo indica urgenza); niente task già presenti nell'elenco ESISTENTI; niente inventato. Scrivi in ${LANG}. Rispondi solo con JSON.`
  const user = `ESISTENTI:\n${existingTitles.slice(0, 80).map((t) => `- ${clip(t, 100)}`).join('\n') || '-'}\n\nTESTO:\n${redactSecrets(text).slice(0, 8000)}`
  const schema = obj({ tasks: arr(obj({ title: str(120), notes: str(600), priority: { type: 'string', enum: [...PRIORITIES] } }), 15) })
  const r = await chatJson(cfg, { system, user, schema, validate: TasksSchema, timeoutMs: 180_000, numCtx: 8192 })
  const seen = new Set(existingTitles.map((t) => t.trim().toLowerCase()))
  const out: ProposedTask[] = []
  for (const t of r.tasks) {
    const title = clip(t.title, 200)
    if (!title || seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())
    out.push({ title, notes: t.notes.trim().slice(0, 2000), priority: t.priority })
  }
  return out.slice(0, 15)
}

// ---------------------------------------------------------------------------
// 3–4. Somiglianze: task simili (duplicati) e ricerca per significato
// ---------------------------------------------------------------------------

/** Vettori già calcolati in questa sessione (testo → vettore), per modello. */
const vectors = new Map<string, number[]>()
const MAX_CACHE = 5000
/** Prefissi consigliati da nomic-embed-text per documenti e ricerche. */
const asDoc = (t: string) => `search_document: ${t}`
const asQuery = (t: string) => `search_query: ${t}`
export const itemText = (i: Pick<Item, 'title' | 'notes'>) => `${i.title}\n${i.notes}`.trim().slice(0, 1000)

async function vectorsFor(cfg: AiConfig, texts: string[]): Promise<number[][]> {
  const key = (t: string) => `${cfg.provider}|${cfg.embedModel}|${t}`
  const missing = [...new Set(texts.filter((t) => !vectors.has(key(t))))]
  if (missing.length) {
    const got = await embed(cfg, missing)
    missing.forEach((t, i) => vectors.set(key(t), got[i]!))
    while (vectors.size > MAX_CACHE) vectors.delete(vectors.keys().next().value!)
  }
  return texts.map((t) => vectors.get(key(t))!)
}
export const __clearVectors = () => vectors.clear()

export interface Scored<T> {
  value: T
  score: number
}

/**
 * Gli elementi più vicini per significato a `query`, sopra la soglia.
 * `mode`: 'search' (una ricerca contro i task) o 'similar' (un task contro gli altri).
 */
export async function nearest<T>(cfg: AiConfig, query: string, candidates: { value: T; text: string }[], opts: { mode: 'search' | 'similar'; threshold: number; max: number }): Promise<Scored<T>[]> {
  const list = candidates.filter((c) => c.text.trim())
  if (!query.trim() || !list.length) return []
  const [q] = await vectorsFor(cfg, [opts.mode === 'search' ? asQuery(query) : asDoc(query)])
  const docs = await vectorsFor(cfg, list.map((c) => asDoc(c.text)))
  return list
    .map((c, i) => ({ value: c.value, score: cosine(q!, docs[i]!) }))
    .filter((s) => s.score >= opts.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.max)
}

/** Soglie (nomic-embed-text): un duplicato è molto vicino; una ricerca accetta di più. */
export const SIMILAR_THRESHOLD = 0.82
export const SEARCH_THRESHOLD = 0.6

// ---------------------------------------------------------------------------
// 5. Commit senza "chiude TODO-n": quale task potrebbero completare
// ---------------------------------------------------------------------------

export interface CommitSuggestion {
  hash: string
  subject: string
  author: string
  date: string
  itemId: string
  seq: number
  reason: string
}
const CommitMatchSchema = z.object({ matches: z.array(z.object({ commit: z.string(), task: z.string(), reason: z.string().default('') })).default([]) })

/** Commit recenti (14 giorni) che non citano già un task e non ancora esaminati. */
export function commitCandidates(commits: GitCommit[], seen: Set<string>, now = Date.now()): GitCommit[] {
  const since = now - 14 * 86_400_000
  return commits.filter((c) => !seen.has(c.hash) && !closedSeqs(c.message).length && (Date.parse(c.date) || now) >= since).slice(0, 15)
}

export async function matchCommits(cfg: AiConfig, commits: GitCommit[], openItems: Item[]): Promise<CommitSuggestion[]> {
  const items = openItems.filter((i) => i.bucket === 'todo' && i.seq > 0).slice(0, 80)
  if (!commits.length || !items.length) return []
  const system = `Confronti i commit git di un progetto con i suoi task aperti e indichi SOLO i casi in cui il messaggio del commit mostra chiaramente che il lavoro descritto dal task è stato completato. Nel dubbio, nessuna corrispondenza. Ogni commit al massimo un task. "reason": perché, in ${LANG}, max 120 caratteri. Rispondi solo con JSON.`
  const user = `COMMIT:\n${commits.map((c) => `${c.hash.slice(0, 10)}: ${clip(redactSecrets(c.message), 300)}`).join('\n')}\n\nTASK APERTI:\n${items.map((i) => `${taskCode(i.seq)}: ${clip(firstLine(i.title), 120)}${i.notes ? ` — ${clip(i.notes, 160)}` : ''}`).join('\n')}`
  const schema = obj({ matches: arr(obj({ commit: str(40), task: str(20), reason: str(160) }), 15) })
  const r = await chatJson(cfg, { system, user, schema, validate: CommitMatchSchema, timeoutMs: 180_000, numCtx: 8192 })
  const out: CommitSuggestion[] = []
  const usedCommits = new Set<string>()
  for (const mt of r.matches) {
    const c = commits.find((x) => mt.commit.trim().length >= 7 && x.hash.startsWith(mt.commit.trim().toLowerCase()))
    const seq = Number(/(\d+)/.exec(mt.task)?.[1])
    const item = items.find((i) => i.seq === seq)
    if (!c || !item || usedCommits.has(c.hash) || out.some((o) => o.itemId === item.id)) continue
    usedCommits.add(c.hash)
    out.push({ hash: c.hash, subject: subjectOf(c.message), author: c.author, date: c.date, itemId: item.id, seq: item.seq, reason: clip(mt.reason, 160) })
  }
  return out
}

// ---------------------------------------------------------------------------
// 6. Riepilogo della settimana
// ---------------------------------------------------------------------------

export interface WeekFacts {
  completed: { project: string; title: string }[]
  created: { project: string; title: string }[]
  overdue: { project: string; title: string; due: string }[]
  upcoming: { project: string; title: string; due: string }[]
}
/** I fatti della settimana, dai progetti visibili: è tutto ciò che riceve il modello. */
export function weekFacts(projects: { name: string; items: Item[]; trashedAt?: string | null }[], now = new Date()): WeekFacts {
  const day = 86_400_000
  const since = now.getTime() - 7 * day
  const today = now.toISOString().slice(0, 10)
  const limit = new Date(now.getTime() + 7 * day).toISOString().slice(0, 10)
  const f: WeekFacts = { completed: [], created: [], overdue: [], upcoming: [] }
  for (const p of projects.filter((x) => !x.trashedAt)) {
    for (const i of p.items) {
      const title = firstLine(i.title)
      if (i.bucket === 'done' && i.completedAt && Date.parse(i.completedAt) >= since) f.completed.push({ project: p.name, title })
      if (i.bucket !== 'trash' && Date.parse(i.createdAt) >= since) f.created.push({ project: p.name, title })
      if (i.bucket === 'todo' && i.dueDate && i.dueDate < today) f.overdue.push({ project: p.name, title, due: i.dueDate })
      else if (i.bucket === 'todo' && i.dueDate && i.dueDate <= limit) f.upcoming.push({ project: p.name, title, due: i.dueDate })
    }
  }
  return f
}
export const hasWeekFacts = (f: WeekFacts) => !!(f.completed.length || f.created.length || f.overdue.length || f.upcoming.length)

const SummarySchema = z.object({ summary: z.string(), highlights: z.array(z.string()).default([]) })
export type WeekSummary = z.infer<typeof SummarySchema>

export async function weeklySummary(cfg: AiConfig, facts: WeekFacts): Promise<WeekSummary> {
  const list = (xs: { project: string; title: string; due?: string }[]) => xs.slice(0, 40).map((x) => `- [${clip(x.project, 60)}] ${clip(x.title, 100)}${x.due ? ` (scadenza ${x.due})` : ''}`).join('\n') || '-'
  const system = `Scrivi in ${LANG} un riepilogo della settimana di lavoro per un gruppo che segue dei progetti software, partendo SOLO dai dati forniti: cosa è stato completato, cosa è nuovo, cosa è in ritardo e cosa scade a breve. Tono chiaro e concreto, niente numeri inventati. "summary": 2-4 frasi. "highlights": fino a 5 punti brevi. Rispondi solo con JSON.`
  const user = `COMPLETATI (7 giorni):\n${list(facts.completed)}\n\nNUOVI (7 giorni):\n${list(facts.created)}\n\nIN RITARDO:\n${list(facts.overdue)}\n\nIN SCADENZA (7 giorni):\n${list(facts.upcoming)}`
  const schema = obj({ summary: str(900), highlights: arr(str(200), 5) })
  const r = await chatJson(cfg, { system, user, schema, validate: SummarySchema, timeoutMs: 180_000, numCtx: 8192 })
  return { summary: r.summary.trim().slice(0, 900), highlights: r.highlights.map((h) => clip(h, 200)).filter(Boolean).slice(0, 5) }
}

// ---------------------------------------------------------------------------
// 7. Istruzioni per gli agenti di programmazione (AGENTS.md / CLAUDE.md)
// ---------------------------------------------------------------------------

const AgentsSchema = z.object({ markdown: z.string() })

export async function agentsDoc(cfg: AiConfig, input: { projectName: string; description: string; stack: Stack; tools: string[]; fileName: string }): Promise<string> {
  const s = input.stack
  const facts = {
    project: input.projectName,
    description: clip(input.description, 500),
    platforms: s.platforms,
    languages: s.languages,
    frameworks: s.frameworks,
    repository: redactSecrets(s.repoUrl),
    prerequisites: s.prerequisites.map((p) => (p.version ? `${p.name} ${p.version}` : p.name)),
    setup: s.steps.map((x) => (x.command ? `${x.title}: ${redactSecrets(x.command)}` : x.title)),
    environmentVariables: s.envVars.map((v) => (v.notes ? `${v.key} — ${clip(v.notes, 120)}` : v.key)),
    notes: redactSecrets(s.notes).slice(0, 1500),
    architecture: s.doc ? redactSecrets(s.doc.content).slice(0, 4000) : '',
    aiTools: input.tools.slice(0, 20),
  }
  const system = `Scrivi in ${LANG} il file ${input.fileName} per gli agenti di programmazione (es. Claude Code, Codex, Copilot) che lavoreranno a questo progetto: panoramica, stack, come preparare l'ambiente, comandi principali, convenzioni e avvertenze, variabili d'ambiente (solo i nomi). Usa SOLO i dati forniti, niente inventato; se un'informazione manca, non citarla. Markdown conciso con titoli. Rispondi solo con JSON {"markdown": "..."}.`
  const r = await chatJson(cfg, { system, user: JSON.stringify(facts), schema: obj({ markdown: str(12000) }), validate: AgentsSchema, timeoutMs: 240_000, numCtx: 12_288 })
  return redactSecrets(r.markdown.trim()).slice(0, 12000)
}
