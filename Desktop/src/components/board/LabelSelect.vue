<script setup lang="ts">
import { t } from '@/i18n'
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'

/**
 * Menu a tendina per l'etichetta di un elemento, nello stesso stile dei
 * selettori di priorità e stato. L'ultima voce apre la gestione delle etichette.
 */
const model = defineModel<string | null>({ required: true })
const emit = defineEmits<{ manage: [] }>()
const ws = useWorkspaceStore()

const MANAGE = '__manage__'
const current = computed(() => (model.value ? ws.labelsById[model.value] : null))

function onChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (v === MANAGE) {
    ;(e.target as HTMLSelectElement).value = model.value ?? ''
    emit('manage')
    return
  }
  model.value = v || null
}
</script>

<template>
  <span class="relative inline-flex items-center">
    <span
      class="pointer-events-none absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
      :style="{ background: current?.color ?? 'transparent', boxShadow: current ? 'none' : 'inset 0 0 0 1.5px var(--ink-3)' }"
    />
    <select
      class="h-6 cursor-default appearance-none rounded-full border border-line bg-surface pl-5 pr-2 text-[12px] font-medium text-ink-2 hover:border-line-strong hover:text-ink focus:border-accent focus:outline-none"
      :value="model ?? ''"
      :title="current ? `Etichetta: ${current.name}` : 'Etichetta'"
      :aria-label="t('Etichetta')"
      @click.stop
      @change="onChange"
    >
      <option value="">{{ t('Nessuna etichetta') }}</option>
      <option v-for="l in ws.tree.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
      <option disabled>──────</option>
      <option :value="MANAGE">{{ t('Gestisci etichette…') }}</option>
    </select>
  </span>
</template>
