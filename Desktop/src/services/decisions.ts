/**
 * Registro delle decisioni di un progetto: le domande con una risposta scelta
 * come decisione, dalla più recente. Funzioni pure.
 */
import type { Answer, Decision, Item, Project, Question } from '@/types'

export interface DecisionEntry {
  item: Item
  question: Question
  answer: Answer
  decision: Decision
}

export function projectDecisions(project: Pick<Project, 'items'>, opts: { includeTrash?: boolean } = {}): DecisionEntry[] {
  const out: DecisionEntry[] = []
  for (const item of project.items) {
    if (item.bucket === 'trash' && !opts.includeTrash) continue
    for (const question of item.questions) {
      const decision = question.decision
      const answer = decision ? question.answers.find((a) => a.id === decision.answerId) : undefined
      if (decision && answer) out.push({ item, question, answer, decision })
    }
  }
  return out.sort((a, b) => b.decision.at.localeCompare(a.decision.at))
}

/** Ricerca nel registro: domanda, risposta, motivazione e titolo del task, senza maiuscole né accenti. */
export function filterDecisions(entries: DecisionEntry[], query: string): DecisionEntry[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  return entries.filter((e) => {
    const hay = norm([e.item.title, e.question.text, e.answer.text, e.decision.rationale].join('\n'))
    return words.every((w) => hay.includes(w))
  })
}

/** Il registro in Markdown, da incollare in un documento (es. il documento di architettura). */
export function decisionsMarkdown(entries: DecisionEntry[], opts: { title: string; userName: (id: string) => string; formatDate: (iso: string) => string; code: (item: Item) => string; why: string }): string {
  const lines = [`## ${opts.title}`, '']
  for (const e of entries) {
    lines.push(`### ${opts.formatDate(e.decision.at)} · ${opts.code(e.item)}`.trim())
    lines.push('', `**${e.question.text.trim()}**`, '', `→ ${e.answer.text.trim()}`)
    if (e.decision.rationale) lines.push('', `${opts.why}: ${e.decision.rationale}`)
    lines.push('', `_${opts.userName(e.decision.by)}_`, '')
  }
  return lines.join('\n').trimEnd() + '\n'
}
