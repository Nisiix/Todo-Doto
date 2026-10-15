<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { CalendarDays } from 'lucide-vue-next'
import { dueState, formatDue, type DueState } from '@/services/items'
import { DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: { due: (d: string) => `Scadenza ${d}`, add: 'Aggiungi scadenza', none: 'Scadenza non impostata' },
  en: { due: (d: string) => `Due ${d}`, add: 'Add due date', none: 'Due date not set' },
})

/** `readonly`: solo da vedere (es. nella riga della lista: si modifica dal dettaglio). */
const props = defineProps<{ done?: boolean; readonly?: boolean }>()
const model = defineModel<string | null>({ required: true })

const TONE: Record<DueState, string> = {
  none: 'text-ink-3',
  overdue: 'text-danger font-semibold',
  soon: 'text-p-alta font-semibold',
  later: 'text-ink-2',
}
const tone = computed(() => (props.done ? 'text-ink-3' : TONE[dueState(model.value)]))
const label = computed(() => (model.value ? formatDue(model.value) : ''))
</script>

<template>
  <!-- In sola lettura (riga della lista) è un semplice badge: la data si cambia dal dettaglio -->
  <component
    :is="readonly ? 'span' : 'label'"
    class="relative inline-flex h-6 shrink-0 cursor-default items-center justify-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[12px] tabular-nums"
    :class="[tone, { 'hover:bg-surface-2': !readonly }]"
    :title="model ? m.due(dayjs(model).format(DATE.dateLong)) : readonly ? m.none : m.add"
    @click="!readonly && $event.stopPropagation()"
  >
    <CalendarDays :size="13" />
    <span data-due-label>{{ label || (readonly ? m.none : '—') }}</span>
    <input
      v-if="!readonly"
      type="date"
      class="absolute inset-0 w-full cursor-default opacity-0"
      :value="model ?? ''"
      @change="model = ($event.target as HTMLInputElement).value || null"
    />
  </component>
</template>
