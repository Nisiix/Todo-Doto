/**
 * Automazioni locali (0.7.0): tre regole fisse, accese dall'amministratore.
 *
 *  - un task con priorità immediata resta senza responsabile per N giorni →
 *    notifica agli amministratori;
 *  - una domanda resta senza risposta per N giorni → avviso a chi vi è menzionato;
 *  - un task diventa Confermato senza scadenza → l'app la chiede a chi lo conferma.
 *
 * Non c'è un server: ogni PC valuta le regole per la persona che lo usa e gli
 * avvisi sono notifiche locali con una chiave fissa, quindi ognuno riceve ogni
 * avviso una volta sola e due PC non si pestano i piedi. Funzioni pure.
 */
import { firstLine } from './items'
import type { Automations, Item, Project } from '@/types'

const DAY = 86_400_000

export type AutomationHit =
  | { rule: 'urgentUnassigned'; key: string; project: Pick<Project, 'id' | 'name'>; item: Item; days: number }
  | { rule: 'unansweredQuestion'; key: string; project: Pick<Project, 'id' | 'name'>; item: Item; days: number; questionId: string; question: string }

export interface AutomationContext {
  now: string
  /** Chi usa questo PC. */
  meId: string | null
  isAdmin: boolean
}

/**
 * Avvisi dovuti a chi usa questo PC, dai progetti che può vedere. La chiave non
 * dipende dal giorno: lo stesso task o la stessa domanda si avvisa una volta sola.
 */
export function automationHits(projects: Pick<Project, 'id' | 'name' | 'items' | 'trashedAt'>[], rules: Automations, ctx: AutomationContext): AutomationHit[] {
  const out: AutomationHit[] = []
  const now = Date.parse(ctx.now)
  const age = (from: string) => (now - Date.parse(from)) / DAY
  const urgent = rules.urgentUnassigned.enabled && ctx.isAdmin
  const questions = rules.unansweredQuestion.enabled && !!ctx.meId
  if (!urgent && !questions) return out
  for (const p of projects) {
    if (p.trashedAt) continue
    const project = { id: p.id, name: p.name }
    for (const item of p.items) {
      if (item.bucket !== 'todo') continue
      if (urgent && item.priority === 'immediata' && !item.assigneeId) {
        const d = age(item.createdAt)
        if (d >= rules.urgentUnassigned.days) out.push({ rule: 'urgentUnassigned', key: `auto:urgent:${item.id}`, project, item, days: Math.floor(d) })
      }
      if (!questions) continue
      for (const q of item.questions) {
        if (q.resolved || q.answers.length || q.authorId === ctx.meId || !q.mentions.includes(ctx.meId!)) continue
        const d = age(q.createdAt)
        if (d >= rules.unansweredQuestion.days)
          out.push({ rule: 'unansweredQuestion', key: `auto:question:${q.id}`, project, item, days: Math.floor(d), questionId: q.id, question: firstLine(q.text) })
      }
    }
  }
  return out
}

/** Il task è appena diventato Confermato e non ha scadenza: si chiede (se la regola è accesa). */
export const shouldAskDueDate = (rules: Automations, before: Pick<Item, 'status'> | undefined, after: Pick<Item, 'status' | 'dueDate' | 'bucket'> | undefined) =>
  rules.confirmedNoDue.enabled && !!before && !!after && before.status !== 'confermato' && after.status === 'confermato' && !after.dueDate && after.bucket === 'todo'
