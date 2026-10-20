import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSessionStore } from '@/stores/session'
import { myDay } from '@/services/today'
import { useToday } from './useToday'

/** La giornata dell'utente corrente nei progetti visibili (vista «Oggi» e numero nella barra laterale). */
export function useMyDay() {
  const ws = useWorkspaceStore()
  const session = useSessionStore()
  const { today } = useToday()
  const day = computed(() =>
    myDay(ws.visibleProjects, {
      meId: ws.currentUser?.id ?? '',
      today: today.value,
      local: !ws.isNetwork,
      snoozed: ws.meta ? session.snoozedOf(ws.meta.id) : {},
    }),
  )
  const snooze = (itemId: string, until: string | null) => (ws.meta ? session.snooze(ws.meta.id, itemId, until, today.value) : Promise.resolve())
  return { day, today, snooze }
}
