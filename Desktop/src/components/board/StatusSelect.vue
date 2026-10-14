<script setup lang="ts">
import { STATUSES, STATUS_LABEL, type Status } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({ it: { status: (s: string) => `Stato: ${s}` }, en: { status: (s: string) => `Status: ${s}` } })

/** `readonly`: solo da vedere (es. nella riga della lista: si modifica dal dettaglio). */
defineProps<{ readonly?: boolean }>()
const model = defineModel<Status>({ required: true })
// Cerchio vuoto → mezzo pieno → pieno: lo stato avanza verso la conferma.
const dot: Record<Status, string> = {
  da_valutare: 'border-ink-3',
  da_definire: 'border-accent [background:linear-gradient(90deg,var(--accent)_50%,transparent_50%)]',
  confermato: 'border-accent bg-accent',
}
</script>

<template>
  <!-- Pallino ed etichetta centrati; il menu a tendina, trasparente, copre tutta la pillola -->
  <span class="relative inline-flex h-6 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-2 text-[12px] font-medium text-ink-2" :class="readonly ? 'cursor-default' : 'hover:border-line-strong hover:text-ink focus-within:border-accent'" :title="readonly ? m.status(STATUS_LABEL[model]) : undefined">
    <span class="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px]" :class="dot[model]" />
    <span class="truncate">{{ STATUS_LABEL[model] }}</span>
    <select v-if="!readonly" v-model="model" class="absolute inset-0 h-full w-full cursor-default appearance-none rounded-full opacity-0" :title="m.status(STATUS_LABEL[model])" @click.stop>
      <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
    </select>
  </span>
</template>
