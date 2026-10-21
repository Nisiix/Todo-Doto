import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { useWorkspaceStore } from './workspace'
import { useNotificationsStore } from './notifications'
import { useToday } from '@/composables/useToday'
import { automationHits, type AutomationHit } from '@/services/automations'
import { firstLine } from '@/services/items'
import { AutomationsSchema } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    days: (n: number) => (n === 1 ? '1 giorno' : `${n} giorni`),
    urgent: (d: string) => `Automazione: task urgente ancora senza responsabile da ${d}`,
    question: (d: string, q: string) => `Automazione: la domanda «${q}» in cui sei menzionato aspetta risposta da ${d}`,
  },
  en: {
    days: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    urgent: (d: string) => `Automation: urgent task still unassigned after ${d}`,
    question: (d: string, q: string) => `Automation: the question “${q}” you are mentioned in has been waiting for an answer for ${d}`,
  },
})

/**
 * Automazioni: questo PC valuta le regole accese dall'amministratore per chi lo
 * usa (all'apertura, a ogni modifica e ogni minuto, col giorno che avanza) e
 * trasforma gli avvisi dovuti in notifiche. La chiave fissa di ogni avviso
 * impedisce di ripeterlo, anche dopo averlo letto o eliminato.
 */
export const useAutomationsStore = defineStore('automations', () => {
  const ws = useWorkspaceStore()
  const notif = useNotificationsStore()
  const { nowIso } = useToday()

  const rules = computed(() => ws.meta?.automations ?? AutomationsSchema.parse({}))
  const hits = computed<AutomationHit[]>(() =>
    ws.status === 'open' ? automationHits(ws.accessibleProjects, rules.value, { now: nowIso.value, meId: ws.currentUser?.id ?? null, isAdmin: ws.isAdmin }) : [],
  )

  function notify(list: AutomationHit[]) {
    for (const h of list) {
      const days = m.days(h.days)
      notif.notifySystem({
        key: h.key,
        type: h.rule === 'urgentUnassigned' ? 'urgent_unassigned' : 'question_waiting',
        projectId: h.project.id,
        projectName: h.project.name,
        itemId: h.item.id,
        itemTitle: firstLine(h.item.title),
        text: h.rule === 'urgentUnassigned' ? m.urgent(days) : m.question(days, h.question.slice(0, 120)),
      })
    }
  }
  watch(hits, notify, { immediate: true })

  return { rules, hits }
})
