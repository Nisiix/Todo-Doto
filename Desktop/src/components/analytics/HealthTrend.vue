<script setup lang="ts">
import { computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { useWorkspaceStore } from '@/stores/workspace'
import { useHealthStore } from '@/stores/health'
import { HEALTH_COLOR, healthMessages, healthSummary } from '@/components/health/healthText'
import { compareText, DATE, defineMessages } from '@/i18n'
import { HEALTH_LEVELS } from '@/types'

const m = defineMessages({
  it: {
    title: 'Salute dei progetti',
    lead: 'Il semaforo di ogni progetto adesso, con i motivi, e com’era nelle settimane scorse (un’istantanea a settimana, scritta dal primo PC che apre il workspace).',
    project: 'Progetto',
    now: 'Adesso',
    why: 'Perché',
    none: 'Nessun progetto con task da fare.',
    noData: 'nessun dato',
  },
  en: {
    title: 'Project health',
    lead: 'Each project’s traffic light now, with the reasons, and how it was in past weeks (one snapshot a week, written by the first PC that opens the workspace).',
    project: 'Project',
    now: 'Now',
    why: 'Why',
    none: 'No project with tasks to do.',
    noData: 'no data',
  },
})

const ws = useWorkspaceStore()
const health = useHealthStore()
onMounted(() => void health.loadHistory())

/** Settimane passate dello storico (la corrente è «Adesso»), dalla più vecchia. */
const weeks = computed(() => health.history.slice(1, 9).map((h) => h.week).reverse())
const levelOf = (projectId: string, week: string) => health.history.find((h) => h.week === week)?.projects[projectId] ?? null
const RANK = Object.fromEntries(HEALTH_LEVELS.map((l, i) => [l, i]))
const rows = computed(() =>
  ws.visibleProjects
    .filter((p) => health.byProject[p.id])
    .map((p) => ({ project: p, now: health.byProject[p.id]! }))
    .sort((a, b) => RANK[b.now.level]! - RANK[a.now.level]! || compareText(a.project.name, b.project.name)),
)
</script>

<template>
  <section class="max-w-5xl" data-health-trend>
    <h2 class="text-[13px] font-semibold text-ink-2">{{ m.title }}</h2>
    <p class="mb-3 mt-0.5 max-w-3xl text-[12.5px] text-ink-3">{{ m.lead }}</p>
    <p v-if="!rows.length" class="text-[13px] text-ink-3">{{ m.none }}</p>
    <table v-else class="w-full text-[13px]">
      <thead class="text-[11.5px] text-ink-3">
        <tr>
          <th class="pb-1 text-left font-semibold">{{ m.project }}</th>
          <th v-for="w in weeks" :key="w" class="w-12 pb-1 text-center font-semibold tabular-nums">{{ dayjs(w).format(DATE.dayMonth) }}</th>
          <th class="w-16 pb-1 text-center font-semibold">{{ m.now }}</th>
          <th class="pb-1 pl-3 text-left font-semibold">{{ m.why }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr v-for="r in rows" :key="r.project.id" :data-health-row="r.project.name">
          <td class="py-1.5 pr-3"><RouterLink :to="{ name: 'project', params: { id: r.project.id } }" class="hover:underline">{{ r.project.name }}</RouterLink></td>
          <td v-for="w in weeks" :key="w" class="text-center">
            <span
              v-if="levelOf(r.project.id, w)"
              class="inline-block h-2.5 w-2.5 rounded-full"
              :style="{ background: HEALTH_COLOR[levelOf(r.project.id, w)!] }"
              :title="healthMessages.level[levelOf(r.project.id, w)!]"
            />
            <span v-else class="text-[11px] text-ink-3" :title="m.noData">·</span>
          </td>
          <td class="text-center">
            <span class="inline-flex items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold" :style="{ color: HEALTH_COLOR[r.now.level] }" :data-health-now="r.now.level">
              <span class="h-2.5 w-2.5 rounded-full" :style="{ background: HEALTH_COLOR[r.now.level] }" /> {{ healthMessages.level[r.now.level] }}
            </span>
          </td>
          <td class="py-1.5 pl-3 text-[12px] text-ink-2" :title="healthSummary(r.now)">{{ r.now.reasons.map((x) => healthMessages.reason[x.key](x.n)).join(' · ') || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
