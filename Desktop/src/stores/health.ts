import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useWorkspaceStore } from './workspace'
import { useToday } from '@/composables/useToday'
import { projectSignals } from '@/services/insights'
import { milestoneProgress } from '@/services/milestones'
import { incompleteUsers, prereqsOf } from '@/services/readiness'
import { projectHealth, type HealthInfo } from '@/services/health'
import { mondayOf } from '@/services/load'
import type { HealthWeek, Project } from '@/types'

/**
 * Salute dei progetti: il semaforo di ognuno (barra laterale, Analisi) e
 * l'andamento per settimana (health/<lunedì>.json, scritto dal primo PC che
 * apre il workspace in quella settimana).
 */
export const useHealthStore = defineStore('health', () => {
  const ws = useWorkspaceStore()
  const { today, nowIso } = useToday()

  function healthOf(p: Project): HealthInfo {
    const signals = projectSignals(p, {
      userIds: ws.users.map((u) => u.id),
      now: nowIso.value,
      absences: Object.fromEntries(ws.users.map((u) => [u.id, u.absences])),
    })
    const lateMilestones = p.milestones.filter((x) => milestoneProgress(x, p.items, today.value).late).length
    const pcMissing = ws.isNetwork ? incompleteUsers(p.id, prereqsOf(p), ws.users, ws.readiness, (u) => ws.canUserSee(u, p)).length : 0
    return projectHealth({ signals, lateMilestones, pcMissing })
  }

  /** Semaforo dei progetti attivi (tutti, non solo quelli visibili: serve anche all'istantanea). */
  const byProject = computed<Record<string, HealthInfo>>(() =>
    Object.fromEntries(Object.values(ws.projects).filter((p) => !p.trashedAt && p.items.some((i) => i.bucket === 'todo')).map((p) => [p.id, healthOf(p)])),
  )

  const history = ref<HealthWeek[]>([])
  async function loadHistory() {
    history.value = (await ws.storage?.readHealthHistory(12).catch(() => [])) ?? []
  }

  /** Istantanea della settimana corrente, se nessun PC l'ha ancora scritta; poi lo storico. */
  async function maybeSnapshot() {
    const s = ws.storage
    if (!s || ws.status !== 'open') return
    const week = mondayOf(today.value)
    const projects = Object.fromEntries(Object.entries(byProject.value).map(([id, h]) => [id, h.level]))
    await s.writeHealthWeek({ week, at: nowIso.value, projects }).catch(() => false)
    await loadHistory()
  }

  function reset() {
    history.value = []
  }

  return { byProject, history, loadHistory, maybeSnapshot, reset }
})
