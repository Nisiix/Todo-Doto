<script setup lang="ts">
import { computed, watch } from 'vue'
import { CalendarDays, CircleDot, Flag, Tag, UserRound, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { canHaveDueDate, formatDue } from '@/services/items'
import { absenceOn } from '@/services/load'
import { pcStatus } from '@/services/health'
import { prereqsOf } from '@/services/readiness'
import { useToday } from '@/composables/useToday'
import dayjs from 'dayjs'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status, type User } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    priority: 'Priorità',
    priorityHint: 'Quanto è urgente rispetto agli altri task.',
    status: 'Stato',
    statusHint: 'A che punto è la decisione su cosa fare.',
    dueDate: 'Scadenza',
    dueHint: 'Entro quando va fatto (facoltativa).',
    dueLocked: 'Si indica quando lo stato è Confermato: solo allora il task entra nel Gantt.',
    clearDue: 'Togli la scadenza',
    assignee: 'Assegnato a',
    assigneeHint: 'Chi se ne occupa: può anche cestinarlo.',
    unassigned: 'Nessuno',
    label: 'Etichetta',
    labelHint: 'Per raggruppare e filtrare i task.',
    noLabel: 'Nessuna',
    manageLabels: 'Gestisci etichette…',
    away: (from: string, to: string) => `assente ${from}–${to}`,
    awayOnDue: 'assente il giorno della scadenza',
    pcReady: 'PC pronto',
    pcMissing: (n: number) => (n === 1 ? 'al PC manca un programma' : `al PC mancano ${n} programmi`),
  },
  en: {
    priority: 'Priority',
    priorityHint: 'How urgent it is compared to the other tasks.',
    status: 'Status',
    statusHint: 'How far the decision on what to do has got.',
    dueDate: 'Due date',
    dueHint: 'When it must be done by (optional).',
    dueLocked: 'Set it once the status is Confirmed: only then does the task enter the Gantt.',
    clearDue: 'Remove the due date',
    assignee: 'Assigned to',
    assigneeHint: 'Who takes care of it: they can also trash it.',
    unassigned: 'Nobody',
    label: 'Label',
    labelHint: 'To group and filter tasks.',
    noLabel: 'None',
    manageLabels: 'Manage labels…',
    away: (from: string, to: string) => `away ${from}–${to}`,
    awayOnDue: 'away on the due date',
    pcReady: 'PC ready',
    pcMissing: (n: number) => (n === 1 ? 'PC missing a program' : `PC missing ${n} programs`),
  },
})

/**
 * Attributi di un task con nome, icona e spiegazione: priorità, stato,
 * scadenza, assegnatario ed etichetta. Gli stessi campi nel dialog "Nuovo
 * task" e nel dettaglio del task selezionato. `idPrefix` distingue gli id dei
 * campi (i- nel dialog, d- nel dettaglio).
 */
/** `projectId`: per mostrare accanto a ogni persona se il suo PC è pronto per il progetto (workspace di rete). */
const props = withDefaults(defineProps<{ idPrefix: string; hints?: boolean; wide?: boolean; projectId?: string }>(), { hints: true, wide: false, projectId: undefined })
const emit = defineEmits<{ manageLabels: [] }>()
const priority = defineModel<Priority>('priority', { required: true })
const status = defineModel<Status>('status', { required: true })
const dueDate = defineModel<string | null>('dueDate', { required: true })
const labelId = defineModel<string | null>('labelId', { required: true })
const assigneeId = defineModel<string | null>('assigneeId', { required: true })
const ws = useWorkspaceStore()
// Assenze: chi sarà assente nei prossimi 14 giorni (o nel giorno della scadenza) si vede già nell'elenco
const { today } = useToday()
/** PC pronto per il progetto (dalle verifiche in background), nei workspace di rete. */
function pcText(u: User) {
  const p = props.projectId ? ws.projects[props.projectId] : undefined
  if (!p || !ws.isNetwork) return ''
  const st = pcStatus(p.id, prereqsOf(p), ws.readiness[u.id])
  if (!st || st.state === 'unknown') return ''
  return st.state === 'ready' ? ` · ${m.pcReady}` : ` · ${m.pcMissing(st.missing.length)}`
}
function awayText(u: User) {
  const due = dueDate.value
  const onDue = due ? absenceOn(u.absences, due) : null
  if (onDue) return ` · ${m.awayOnDue}`
  const limit = dayjs(today.value).add(14, 'day').format('YYYY-MM-DD')
  const a = u.absences.find((x) => x.to >= today.value && x.from <= limit)
  return a ? ` · ${m.away(formatDue(a.from), formatDue(a.to))}` : ''
}

/** Pallini dei valori scelti, come nella lista. */
const statusDot: Record<Status, string> = {
  da_valutare: 'border-ink-3',
  da_definire: 'border-accent [background:linear-gradient(90deg,var(--accent)_50%,transparent_50%)]',
  confermato: 'border-accent bg-accent',
}
const label = computed(() => (labelId.value ? ws.labelsById[labelId.value] : null))
/** La scadenza si indica solo con stato Confermato; lasciandolo, la scadenza si toglie. */
const dueEnabled = computed(() => canHaveDueDate(status.value))
watch(status, (s) => {
  if (!canHaveDueDate(s)) dueDate.value = null
})
</script>

<template>
  <div class="grid grid-cols-1 gap-x-5 gap-y-4" :class="wide ? 'sm:grid-cols-2' : 'grid-cols-2 gap-x-3'" data-item-fields>
    <!-- Priorità -->
    <div class="min-w-0">
      <label class="label flex items-center gap-1.5" :for="`${idPrefix}-priority`"><Flag :size="13" class="text-ink-3" /> {{ m.priority }}</label>
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" :class="`bg-p-${priority}`" />
        <select :id="`${idPrefix}-priority`" v-model="priority" class="field pl-8">
          <option v-for="p in PRIORITIES" :key="p" :value="p">{{ PRIORITY_LABEL[p] }}</option>
        </select>
      </div>
      <p v-if="hints" class="mt-1 text-[11.5px] text-ink-3">{{ m.priorityHint }}</p>
    </div>
    <!-- Stato -->
    <div class="min-w-0">
      <label class="label flex items-center gap-1.5" :for="`${idPrefix}-status`"><CircleDot :size="13" class="text-ink-3" /> {{ m.status }}</label>
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-[1.5px]" :class="statusDot[status]" />
        <select :id="`${idPrefix}-status`" v-model="status" class="field pl-8">
          <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
        </select>
      </div>
      <p v-if="hints" class="mt-1 text-[11.5px] text-ink-3">{{ m.statusHint }}</p>
    </div>
    <!-- Scadenza -->
    <div class="min-w-0">
      <label class="label flex items-center gap-1.5" :for="`${idPrefix}-due`"><CalendarDays :size="13" class="text-ink-3" /> {{ m.dueDate }}</label>
      <div class="flex gap-1.5">
        <input
          :id="`${idPrefix}-due`"
          type="date"
          class="field min-w-0 disabled:cursor-not-allowed disabled:opacity-50"
          :value="dueDate ?? ''"
          :disabled="!dueEnabled"
          @change="dueDate = ($event.target as HTMLInputElement).value || null"
        />
        <BaseButton v-if="dueDate && dueEnabled" size="icon" variant="ghost" :title="m.clearDue" :aria-label="m.clearDue" @click="dueDate = null"><X :size="15" /></BaseButton>
      </div>
      <p v-if="!dueEnabled" class="mt-1 text-[11.5px] text-ink-2" data-due-locked>{{ m.dueLocked }}</p>
      <p v-else-if="hints" class="mt-1 text-[11.5px] text-ink-3">{{ m.dueHint }}</p>
    </div>
    <!-- Assegnato a -->
    <div class="min-w-0">
      <label class="label flex items-center gap-1.5" :for="`${idPrefix}-assignee`"><UserRound :size="13" class="text-ink-3" /> {{ m.assignee }}</label>
      <select :id="`${idPrefix}-assignee`" class="field" :value="assigneeId ?? ''" @change="assigneeId = ($event.target as HTMLSelectElement).value || null">
        <option value="">{{ m.unassigned }}</option>
        <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}{{ awayText(u) || pcText(u) }}</option>
      </select>
      <p v-if="hints" class="mt-1 text-[11.5px] text-ink-3">{{ m.assigneeHint }}</p>
    </div>
    <!-- Etichetta -->
    <div class="min-w-0" :class="wide ? 'sm:col-span-2' : 'col-span-2'">
      <label class="label flex items-center gap-1.5" :for="`${idPrefix}-label`"><Tag :size="13" class="text-ink-3" /> {{ m.label }}</label>
      <div class="relative">
        <span
          class="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
          :style="{ background: label?.color ?? 'transparent', boxShadow: label ? 'none' : 'inset 0 0 0 1.5px var(--ink-3)' }"
        />
        <select :id="`${idPrefix}-label`" class="field pl-8" :value="labelId ?? ''" @change="labelId = ($event.target as HTMLSelectElement).value || null">
          <option value="">{{ m.noLabel }}</option>
          <option v-for="l in ws.tree.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </div>
      <!-- Sotto la combo: spiegazione a sinistra, "Gestisci etichette…" a destra -->
      <div class="mt-1 flex items-start justify-between gap-3">
        <p class="text-[11.5px] text-ink-3">{{ hints ? m.labelHint : '' }}</p>
        <button type="button" class="shrink-0 text-[12px] font-medium text-accent-ink hover:underline" @click="emit('manageLabels')">{{ m.manageLabels }}</button>
      </div>
    </div>
  </div>
</template>
