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
