<script setup lang="ts">
import { PRIORITIES, PRIORITY_LABEL, type Priority } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({ it: { priority: (p: string) => `Priorità: ${p}` }, en: { priority: (p: string) => `Priority: ${p}` } })

/** `readonly`: solo da vedere (es. nella riga della lista: si modifica dal dettaglio). */
defineProps<{ compact?: boolean; readonly?: boolean }>()
const model = defineModel<Priority>({ required: true })
</script>

<template>
  <!-- Pallino ed etichetta centrati; il menu a tendina, trasparente, copre tutta la pillola -->
  <span class="relative inline-flex h-6 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-2 text-[12px] font-medium text-ink-2" :class="[{ 'w-6 !px-0': compact }, readonly ? 'cursor-default' : 'hover:border-line-strong hover:text-ink focus-within:border-accent']" :title="readonly ? m.priority(PRIORITY_LABEL[model]) : undefined">
    <span class="h-2 w-2 shrink-0 rounded-full" :class="`bg-p-${model}`" />
    <span v-if="!compact" class="truncate">{{ PRIORITY_LABEL[model] }}</span>
    <select v-if="!readonly" v-model="model" class="absolute inset-0 h-full w-full cursor-default appearance-none rounded-full opacity-0" :title="m.priority(PRIORITY_LABEL[model])" @click.stop>
      <option v-for="p in PRIORITIES" :key="p" :value="p">{{ PRIORITY_LABEL[p] }}</option>
    </select>
  </span>
</template>
