<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: { label: 'Etichetta', labelNamed: (n: string) => `Etichetta: ${n}`, none: 'Nessuna etichetta' },
  en: { label: 'Label', labelNamed: (n: string) => `Label: ${n}`, none: 'No label' },
})

/** Badge colorato di un'etichetta; non rende nulla se l'etichetta non esiste più. */
const props = defineProps<{ labelId: string | null }>()
const ws = useWorkspaceStore()
const label = computed(() => (props.labelId ? ws.labelsById[props.labelId] : null))
</script>

<template>
  <span
    v-if="label"
    class="inline-flex h-5 max-w-32 shrink-0 items-center truncate rounded-full px-2 text-[11px] font-semibold text-white"
    :style="{ background: label.color }"
    :title="m.labelNamed(label.name)"
  >
    {{ label.name }}
  </span>
</template>
