<script setup lang="ts">
import { computed } from 'vue'
import { Flag } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { sortMilestones } from '@/services/milestones'
import type { Item, Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: { label: 'Tappa', none: 'Nessuna', closed: '(raggiunta)', hint: 'La versione o il rilascio di cui fa parte: si salva subito.' },
  en: { label: 'Milestone', none: 'None', closed: '(reached)', hint: 'The version or release it belongs to: saved right away.' },
})

/** Tappa del task (si salva subito, come le dipendenze). Compare solo se il progetto ha tappe. */
const props = defineProps<{ item: Item; project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const options = computed(() => sortMilestones(props.project.milestones))
const current = computed(() => props.project.milestones.find((x) => x.id === props.item.milestoneId) ?? null)
const set = (id: string) => ws.updateItem(props.project.id, props.item.id, { milestoneId: id || null })
</script>

<template>
  <div v-if="project.milestones.length || item.milestoneId" data-item-milestone>
    <label class="label flex items-center gap-1.5" for="d-milestone"><Flag :size="13" class="text-ink-3" /> {{ m.label }}</label>
    <select v-if="!readOnly" id="d-milestone" class="field" :value="item.milestoneId ?? ''" @change="set(($event.target as HTMLSelectElement).value)">
      <option value="">{{ m.none }}</option>
      <option v-for="ms in options" :key="ms.id" :value="ms.id">{{ ms.name }} {{ ms.closedAt ? m.closed : '' }}</option>
    </select>
    <p v-else class="text-[13px]">{{ current?.name ?? m.none }}</p>
    <p v-if="!readOnly" class="mt-1 text-[11.5px] text-ink-3">{{ m.hint }}</p>
  </div>
</template>
