import type { HealthInfo, HealthReason } from '@/services/health'
import type { HealthLevel } from '@/types'
import { defineMessages, plural } from '@/i18n'

/** Testi del semaforo dei progetti, condivisi da barra laterale e Analisi. */
export const healthMessages = defineMessages({
  it: {
    level: { green: 'In salute', yellow: 'Da guardare', red: 'In difficoltà' } as Record<HealthLevel, string>,
    reason: {
      overdue: (n: number) => `${n} in ritardo`,
      late_milestone: (n: number) => `${n} ${plural(n, 'tappa', 'tappe')} in ritardo`,
      urgent_unassigned: (n: number) => `${n} ${plural(n, 'urgenza', 'urgenze')} senza nessuno`,
      unanswered: (n: number) => `${n} ${plural(n, 'domanda', 'domande')} senza risposta`,
      due_in_absence: (n: number) => `${n} in scadenza durante un’assenza`,
      removed_assignee: (n: number) => `${n} di utenti non più nel workspace`,
      pc_missing: (n: number) => `${n} ${plural(n, 'PC non pronto', 'PC non pronti')}`,
      confirmed_no_due: (n: number) => `${n} ${plural(n, 'confermato', 'confermati')} senza scadenza`,
      stale: (n: number) => `${n} ${plural(n, 'fermo', 'fermi')}`,
    } as Record<HealthReason, (n: number) => string>,
  },
  en: {
    level: { green: 'Healthy', yellow: 'Worth a look', red: 'In trouble' } as Record<HealthLevel, string>,
    reason: {
      overdue: (n: number) => `${n} overdue`,
      late_milestone: (n: number) => `${n} late ${plural(n, 'milestone', 'milestones')}`,
      urgent_unassigned: (n: number) => `${n} urgent with nobody on ${plural(n, 'it', 'them')}`,
      unanswered: (n: number) => `${n} unanswered ${plural(n, 'question', 'questions')}`,
      due_in_absence: (n: number) => `${n} due during an absence`,
      removed_assignee: (n: number) => `${n} assigned to former members`,
      pc_missing: (n: number) => `${n} ${plural(n, 'PC', 'PCs')} not ready`,
      confirmed_no_due: (n: number) => `${n} confirmed without a due date`,
      stale: (n: number) => `${n} stuck`,
    } as Record<HealthReason, (n: number) => string>,
  },
})

export const healthSummary = (h: HealthInfo) =>
  [healthMessages.level[h.level], ...h.reasons.map((r) => healthMessages.reason[r.key](r.n))].join(' · ')

/** Colore del semaforo (bordo dell'anello o pallino). */
export const HEALTH_COLOR: Record<HealthLevel, string> = { green: 'var(--ok)', yellow: 'var(--p-media)', red: 'var(--danger)' }
