/**
 * Collegamento commit git → task: codice del task (TODO-12), frase da scrivere
 * nel messaggio del commit ("chiude TODO-12"), riconoscimento e piano di
 * chiusura. Funzioni pure.
 */
import type { Item, Project } from '@/types'

export const TASK_PREFIX = 'TODO'

export interface GitCommit {
  hash: string
  author: string
  /** ISO 8601 */
  date: string
  message: string
}

/** Codice del task, da citare nei commit. */
export const taskCode = (seq: number) => `${TASK_PREFIX}-${seq}`

/** Frase da scrivere nel messaggio del commit per chiudere il task. */
export const closePhrase = (seq: number, lang: 'it' | 'en' = 'it') => `${lang === 'en' ? 'closes' : 'chiude'} ${taskCode(seq)}`

/** Parole che chiudono il task (italiano e inglese, come GitHub e GitLab). */
export const CLOSE_WORDS = ['chiude', 'chiudi', 'chiuso', 'risolve', 'risolto', 'closes', 'close', 'closed', 'fixes', 'fix', 'fixed', 'resolves', 'resolve', 'resolved'] as const

const CODE = `${TASK_PREFIX}-(\\d+)`
const LIST = `${CODE}(?:\\s*(?:,|e|and|&)\\s*${CODE})*`
const CLOSE_RE = new RegExp(`\\b(?:${CLOSE_WORDS.join('|')})\\b\\s*:?\\s*(${LIST})`, 'gi')
const CODE_RE = new RegExp(`\\b${CODE}\\b`, 'gi')

/** Numeri dei task che il messaggio chiude ("chiude TODO-3, TODO-4", "fixes todo-7"). */
export function closedSeqs(message: string): number[] {
  const out = new Set<number>()
  for (const m of message.matchAll(CLOSE_RE)) {
    for (const c of m[1]!.matchAll(CODE_RE)) {
      const n = Number(c[1])
      if (n > 0) out.add(n)
    }
  }
  return [...out]
}

/** Prima riga del messaggio. */
export const subjectOf = (message: string) => message.split(/\r?\n/).find((l) => l.trim())?.trim() ?? ''

/**
 * Numera i task che non hanno ancora un numero (file di versioni precedenti),
 * in ordine di creazione, dopo il numero più alto, e allinea il contatore del
 * progetto. Deterministica: due PC che leggono lo stesso file danno gli stessi
 * numeri. Restituisce true se ha cambiato qualcosa.
 */
export function normalizeSeq(p: Pick<Project, 'items' | 'nextSeq'>): boolean {
  let max = 0
  for (const i of p.items) if (i.seq > max) max = i.seq
  const missing = p.items.filter((i) => !i.seq).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  for (const i of missing) i.seq = ++max
  const before = p.nextSeq
  p.nextSeq = Math.max(p.nextSeq, max + 1)
  return missing.length > 0 || p.nextSeq !== before
}

export interface GitClosePlan {
  /** Task da completare, con il commit che li chiude. */
  close: { item: Item; commit: GitCommit }[]
  /** Commit con riferimenti, da segnare come usati (anche se non chiudono nulla). */
  handled: string[]
}

/**
 * Cosa fare con i commit letti. Alla prima lettura (`baselineDone` falso) i
 * commit esistenti si segnano come visti senza chiudere nulla. Ogni commit vale
 * una volta sola: un task riaperto a mano non viene richiuso dallo stesso commit.
 * Si chiudono solo i task "da fare"; quelli già completati o nel cestino si lasciano.
 */
export function planGitClose(p: Pick<Project, 'items' | 'git'>, commits: GitCommit[]): GitClosePlan {
  const done = new Set(p.git.handled)
  const plan: GitClosePlan = { close: [], handled: [] }
  // Dal più vecchio al più recente: se due commit chiudono lo stesso task, conta il primo
  for (const c of [...commits].reverse()) {
    if (done.has(c.hash)) continue
    const seqs = closedSeqs(c.message)
    if (!seqs.length) continue
    plan.handled.push(c.hash)
    done.add(c.hash)
    if (!p.git.baselineDone) continue
    for (const n of seqs) {
      const item = p.items.find((i) => i.seq === n)
      if (item && item.bucket === 'todo' && !plan.close.some((x) => x.item.id === item.id)) plan.close.push({ item, commit: c })
    }
  }
  return plan
}

/** Quanti commit usati ricordare per progetto (i più recenti). */
export const MAX_HANDLED = 1000

/**
 * Commit dal reflog di .git (quando git non è installato): solo i commit fatti
 * in questa cartella, con la sola prima riga del messaggio.
 * Formato: `<vecchio> <nuovo> Nome <email> <secondi> <fuso>\t<azione>: <messaggio>`
 */
export function parseReflog(text: string): GitCommit[] {
  const out: GitCommit[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^[0-9a-f]{40} ([0-9a-f]{40}) (.*?) <[^>]*> (\d+) [+-]\d{4}\t(commit[^:]*): (.*)$/.exec(line)
    if (!m) continue
    out.push({ hash: m[1]!, author: m[2]!, date: new Date(Number(m[3]) * 1000).toISOString(), message: m[5]! })
  }
  return out.reverse() // il più recente per primo, come git log
}

// ---------------------------------------------------------------------------
// Attività git per task: commit che citano il task, branch del task
// ---------------------------------------------------------------------------

/** Numeri di tutti i task citati nel messaggio, che lo chiudano o no ("TODO-12 primo passo"). */
export function mentionedSeqs(message: string): number[] {
  const out = new Set<number>()
  for (const c of message.matchAll(CODE_RE)) {
    const n = Number(c[1])
    if (n > 0) out.add(n)
  }
  return [...out]
}

/**
 * Nome del branch per il task: `todo-12-esportazione-csv` (minuscole, senza
 * accenti, al massimo ~40 caratteri tagliati su un trattino).
 */
export function branchName(seq: number, title: string): string {
  const slug = (title.split(/\r?\n/).find((l) => l.trim()) ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  let cut = slug
  if (cut.length > 40) {
    cut = cut.slice(0, 41)
    cut = cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut.slice(0, 40)
  }
  return cut ? `${TASK_PREFIX.toLowerCase()}-${seq}-${cut}` : `${TASK_PREFIX.toLowerCase()}-${seq}`
}

/** Numero del task dal nome di un branch (`todo-12-…`, `feature/todo-12`), o null. */
export function seqFromBranch(branch: string | null | undefined): number | null {
  const m = /(?:^|\/)todo-(\d+)(?:$|[-_/])/i.exec(branch ?? '')
  return m ? Number(m[1]) || null : null
}

/** Branch corrente dal contenuto di `.git/HEAD` (`ref: refs/heads/<nome>`); null se staccato. */
export function branchFromHead(head: string): string | null {
  const m = /^ref:\s*refs\/heads\/(.+?)\s*$/m.exec(head)
  return m ? m[1]! : null
}

export interface TaskCommit {
  commit: GitCommit
  /** Il commit chiude il task ("chiude TODO-12"), oltre a citarlo. */
  closes: boolean
}

/** Commit che citano ciascun task, dal più recente (come arrivano da git log). */
export function commitsBySeq(commits: GitCommit[]): Map<number, TaskCommit[]> {
  const out = new Map<number, TaskCommit[]>()
  for (const commit of commits) {
    const closing = new Set(closedSeqs(commit.message))
    for (const seq of mentionedSeqs(commit.message)) {
      const list = out.get(seq) ?? []
      list.push({ commit, closes: closing.has(seq) })
      out.set(seq, list)
    }
  }
  return out
}

/** Giorni entro cui un commit o il branch corrente fanno dire «in lavorazione». */
export const ACTIVE_DAYS = 3

/**
 * Il task è in lavorazione secondo il codice: c'è un commit che lo cita negli
 * ultimi giorni, oppure su questo PC è aperto il suo branch.
 */
export function isActiveFromGit(seq: number, list: TaskCommit[] | undefined, currentBranch: string | null, now = Date.now()): boolean {
  if (seq && seqFromBranch(currentBranch) === seq) return true
  const since = now - ACTIVE_DAYS * 86_400_000
  return !!list?.some((t) => !t.closes && Date.parse(t.commit.date) >= since)
}
