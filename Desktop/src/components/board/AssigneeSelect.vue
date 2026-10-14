<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: { assignedTo: (n: string) => `Assegnato a ${n}`, assign: 'Assegna a…', assignee: 'Assegnato a', unassigned: 'Non assegnato' },
  en: { assignedTo: (n: string) => `Assigned to ${n}`, assign: 'Assign to…', assignee: 'Assigned to', unassigned: 'Unassigned' },
})

/** Menu a tendina "assegnato a", nello stile degli altri selettori della riga. */
const model = defineModel<string | null>({ required: true })
const ws = useWorkspaceStore()
const current = computed(() => (model.value ? ws.usersById[model.value] : null))
const initials = computed(() =>
  (current.value?.displayName ?? '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join(''),
)
</script>

<template>
  <span class="relative inline-flex items-center">
    <span
      class="pointer-events-none absolute left-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-[8px] font-bold"
      :class="current ? 'bg-accent-soft text-accent-ink' : 'border border-dashed border-ink-3 text-ink-3'"
    >
      {{ current ? initials : '?' }}
    </span>
    <select
      class="h-6 cursor-default appearance-none rounded-full border border-line bg-surface pl-6 pr-2 text-[12px] font-medium text-ink-2 hover:border-line-strong hover:text-ink focus:border-accent focus:outline-none"
      :value="model ?? ''"
      :title="current ? m.assignedTo(current.displayName) : m.assign"
      :aria-label="m.assignee"
      @click.stop
      @change="model = ($event.target as HTMLSelectElement).value || null"
    >
      <option value="">{{ m.unassigned }}</option>
      <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
    </select>
  </span>
</template>
