<script setup lang="ts">
import { STATUSES, STATUS_LABEL, type Status } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({ it: { status: (s: string) => `Stato: ${s}` }, en: { status: (s: string) => `Status: ${s}` } })

const model = defineModel<Status>({ required: true })
// Cerchio vuoto → mezzo pieno → pieno: lo stato avanza verso la conferma.
const dot: Record<Status, string> = {
  da_valutare: 'border-ink-3',
  da_definire: 'border-accent [background:linear-gradient(90deg,var(--accent)_50%,transparent_50%)]',
  confermato: 'border-accent bg-accent',
}
</script>

<template>
  <span class="relative inline-flex items-center">
    <span class="pointer-events-none absolute left-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-[1.5px]" :class="dot[model]" />
    <select
      v-model="model"
      class="h-6 cursor-default appearance-none rounded-full border border-line bg-surface pl-5.5 pr-2 text-[12px] font-medium text-ink-2 hover:border-line-strong hover:text-ink focus:border-accent focus:outline-none"
      :title="m.status(STATUS_LABEL[model])"
      @click.stop
    >
      <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
    </select>
  </span>
</template>
