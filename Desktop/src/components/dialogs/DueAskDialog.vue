<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { firstLine } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import { DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Entro quando?',
    description: (t: string) => `Hai confermato «${t}»: indica la scadenza, così compare nel Gantt, nel carico e nei calendari.`,
    week: 'Tra una settimana',
    twoWeeks: 'Tra due settimane',
    endOfMonth: 'Fine mese',
    date: 'Scadenza',
    later: 'Più tardi',
    save: 'Imposta scadenza',
  },
  en: {
    title: 'By when?',
    description: (t: string) => `You confirmed “${t}”: set a due date so it shows in the Gantt chart, the workload and the calendars.`,
    week: 'In a week',
    twoWeeks: 'In two weeks',
    endOfMonth: 'End of month',
    date: 'Due date',
    later: 'Later',
    save: 'Set due date',
  },
})

/** Automazione «confermato senza scadenza»: la scadenza si chiede subito a chi conferma. */
const ws = useWorkspaceStore()
const ui = useUiStore()

const item = computed(() => (ui.dueAsk ? ws.projects[ui.dueAsk.projectId]?.items.find((i) => i.id === ui.dueAsk!.itemId) : undefined))
const open = computed({
  get: () => !!ui.dueAsk && !!item.value,
  set: (v) => {
    if (!v) ui.dueAsk = null
  },
})
const label = computed(() => (item.value ? [item.value.seq ? taskCode(item.value.seq) : '', firstLine(item.value.title)].filter(Boolean).join(' ') : ''))
const date = ref('')
watch(open, (o) => {
  if (o) date.value = dayjs().add(1, 'week').format('YYYY-MM-DD')
})
const quick = computed(() => [
  { label: m.week, value: dayjs().add(1, 'week').format('YYYY-MM-DD') },
  { label: m.twoWeeks, value: dayjs().add(2, 'week').format('YYYY-MM-DD') },
  { label: m.endOfMonth, value: dayjs().endOf('month').format('YYYY-MM-DD') },
])

async function save() {
  const ask = ui.dueAsk
  if (!ask || !date.value) return
  ui.dueAsk = null
  await ws.updateItem(ask.projectId, ask.itemId, { dueDate: date.value })
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description(label)" width="sm">
    <form class="space-y-3 text-[13px]" data-due-ask @submit.prevent="save">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="q in quick"
          :key="q.label"
          type="button"
          class="rounded-full border px-2.5 py-1 text-[12.5px]"
          :class="date === q.value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line hover:bg-surface-2'"
          :title="dayjs(q.value).format(DATE.dateLong)"
          @click="date = q.value"
        >
          {{ q.label }}
        </button>
      </div>
      <label class="flex items-center gap-2">
        <span class="text-ink-2">{{ m.date }}</span>
        <input v-model="date" type="date" required class="h-8 rounded-md border border-line bg-surface px-2" data-autofocus data-due-ask-date />
      </label>
      <div class="flex justify-end gap-2">
        <BaseButton variant="ghost" @click="open = false">{{ m.later }}</BaseButton>
        <BaseButton type="submit" variant="primary" :disabled="!date" data-due-ask-save>{{ m.save }}</BaseButton>
      </div>
    </form>
  </BaseDialog>
</template>
