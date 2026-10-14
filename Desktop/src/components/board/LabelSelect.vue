<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: { label: 'Etichetta', labelNamed: (n: string) => `Etichetta: ${n}`, none: 'Nessuna etichetta', noneShort: 'Nessuna' },
  en: { label: 'Label', labelNamed: (n: string) => `Label: ${n}`, none: 'No label', noneShort: 'None' },
})

/**
 * Menu a tendina per l'etichetta di un elemento, nello stesso stile dei
 * selettori di priorità e stato. La gestione delle etichette sta nel menu
 * del workspace e nel link "Gestisci etichette" dei dialog.
 */
/** `readonly`: solo da vedere (es. nella riga della lista: si modifica dal dettaglio). */
defineProps<{ readonly?: boolean }>()
const model = defineModel<string | null>({ required: true })
const ws = useWorkspaceStore()

const current = computed(() => (model.value ? ws.labelsById[model.value] : null))
</script>

<template>
  <!-- Pallino ed etichetta centrati; il menu a tendina, trasparente, copre tutta la pillola -->
  <span class="relative inline-flex h-6 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-2 text-[12px] font-medium text-ink-2" :class="readonly ? 'cursor-default' : 'hover:border-line-strong hover:text-ink focus-within:border-accent'" :title="readonly ? (current ? m.labelNamed(current.name) : m.none) : undefined">
    <span
      class="h-2 w-2 shrink-0 rounded-full"
      :style="{ background: current?.color ?? 'transparent', boxShadow: current ? 'none' : 'inset 0 0 0 1.5px var(--ink-3)' }"
    />
    <span class="truncate" :class="{ 'text-ink-3': !current }">{{ current?.name ?? m.noneShort }}</span>
    <select
      v-if="!readonly"
      class="absolute inset-0 h-full w-full cursor-default appearance-none rounded-full opacity-0"
      :value="model ?? ''"
      :title="current ? m.labelNamed(current.name) : m.label"
      :aria-label="m.label"
      @click.stop
      @change="model = ($event.target as HTMLSelectElement).value || null"
    >
      <option value="">{{ m.none }}</option>
      <option v-for="l in ws.tree.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
    </select>
  </span>
</template>
