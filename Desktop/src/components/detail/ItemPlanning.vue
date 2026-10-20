<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Flag, Hourglass } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { sortMilestones } from '@/services/milestones'
import type { Item, Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    milestone: 'Tappa',
    none: 'Nessuna',
    closed: '(raggiunta)',
    estimate: 'Stima (ore)',
    estimatePlaceholder: 'Facoltativa',
    hint: 'Si salvano subito. La stima serve al carico per settimana.',
  },
  en: {
    milestone: 'Milestone',
    none: 'None',
    closed: '(reached)',
    estimate: 'Estimate (hours)',
    estimatePlaceholder: 'Optional',
    hint: 'Saved right away. The estimate feeds the load by week.',
  },
})

/** Pianificazione del task: tappa e stima in ore (si salvano subito, come le dipendenze). */
const props = defineProps<{ item: Item; project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const options = computed(() => sortMilestones(props.project.milestones))
const current = computed(() => props.project.milestones.find((x) => x.id === props.item.milestoneId) ?? null)
const setMilestone = (id: string) => ws.updateItem(props.project.id, props.item.id, { milestoneId: id || null })

const estimate = ref('')
watch(
  () => props.item.estimateHours,
  (h) => (estimate.value = h === null ? '' : String(h)),
  { immediate: true },
)
async function saveEstimate() {
  const raw = estimate.value.replace(',', '.').trim()
  const n = raw === '' ? null : Math.max(0, Math.min(999, Math.round(Number(raw) * 10) / 10))
  if (n !== null && Number.isNaN(n)) return void (estimate.value = props.item.estimateHours === null ? '' : String(props.item.estimateHours))
  if (n !== props.item.estimateHours) await ws.updateItem(props.project.id, props.item.id, { estimateHours: n })
}
</script>

<template>
  <div v-if="!readOnly || item.milestoneId || item.estimateHours !== null" data-item-planning>
    <div class="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
      <div v-if="project.milestones.length || item.milestoneId" data-item-milestone>
        <label class="label flex items-center gap-1.5" for="d-milestone"><Flag :size="13" class="text-ink-3" /> {{ m.milestone }}</label>
        <select v-if="!readOnly" id="d-milestone" class="field" :value="item.milestoneId ?? ''" @change="setMilestone(($event.target as HTMLSelectElement).value)">
          <option value="">{{ m.none }}</option>
          <option v-for="ms in options" :key="ms.id" :value="ms.id">{{ ms.name }} {{ ms.closedAt ? m.closed : '' }}</option>
        </select>
        <p v-else class="text-[13px]">{{ current?.name ?? m.none }}</p>
      </div>
      <div v-else />
      <div>
        <label class="label flex items-center gap-1.5" for="d-estimate"><Hourglass :size="13" class="text-ink-3" /> {{ m.estimate }}</label>
        <input
          id="d-estimate"
          v-model="estimate"
          class="field"
          inputmode="decimal"
          :placeholder="m.estimatePlaceholder"
          :disabled="readOnly"
          @change="saveEstimate()"
          @keydown.enter.prevent="saveEstimate()"
        />
      </div>
    </div>
    <p v-if="!readOnly" class="mt-1 text-[11.5px] text-ink-3">{{ m.hint }}</p>
  </div>
</template>
