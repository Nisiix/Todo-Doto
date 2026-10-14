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
  <!-- Iniziali e nome centrati; il menu a tendina, trasparente, copre tutta la pillola -->
  <span class="relative inline-flex h-6 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-2 text-[12px] font-medium text-ink-2 hover:border-line-strong hover:text-ink focus-within:border-accent">
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
      :class="current ? 'bg-accent-soft text-accent-ink' : 'border border-dashed border-ink-3 text-ink-3'"
    >
      {{ current ? initials : '?' }}
    </span>
    <span class="truncate">{{ current?.displayName ?? m.unassigned }}</span>
    <select
      class="absolute inset-0 h-full w-full cursor-default appearance-none rounded-full opacity-0"
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
