<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarDays, CircleDot, Flag, Tag, UserRound, X } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    errTitle: 'Dai un titolo all’elemento.',
    created: 'Task creato',
    title: 'Nuovo task',
    description: 'Un titolo breve per la lista; i dettagli nella descrizione. Gli altri campi si possono cambiare anche dopo.',
    titleLabel: 'Titolo',
    titlePlaceholder: 'Es. Pagina di accesso con verifica email',
    notes: 'Descrizione',
    notesPlaceholder: 'Cosa va fatto, decisioni, riferimenti… (facoltativa)',
    details: 'Dettagli',
    priority: 'Priorità',
    priorityHint: 'Quanto è urgente rispetto agli altri task.',
    status: 'Stato',
    statusHint: 'A che punto è la decisione su cosa fare.',
    dueDate: 'Scadenza',
    dueHint: 'Entro quando va fatto (facoltativa).',
    clearDue: 'Togli la scadenza',
    assignee: 'Assegnato a',
    assigneeHint: 'Chi se ne occupa: può anche cestinarlo.',
    unassigned: 'Nessuno',
    label: 'Etichetta',
    labelHint: 'Per raggruppare e filtrare i task.',
    noLabel: 'Nessuna',
    manageLabels: 'Gestisci etichette…',
    ctrlEnter: 'Ctrl+Invio',
  },
  en: {
    errTitle: 'Give the item a title.',
    created: 'Task created',
    title: 'New task',
    description: 'A short title for the list; the details go in the description. The other fields can also be changed later.',
    titleLabel: 'Title',
    titlePlaceholder: 'E.g. Sign-in page with email verification',
    notes: 'Description',
    notesPlaceholder: 'What needs doing, decisions, references… (optional)',
    details: 'Details',
    priority: 'Priority',
    priorityHint: 'How urgent it is compared to the other tasks.',
    status: 'Status',
    statusHint: 'How far the decision on what to do has got.',
    dueDate: 'Due date',
    dueHint: 'When it must be done by (optional).',
    clearDue: 'Remove the due date',
    assignee: 'Assigned to',
    assigneeHint: 'Who takes care of it: they can also trash it.',
    unassigned: 'Nobody',
    label: 'Label',
    labelHint: 'To group and filter tasks.',
    noLabel: 'None',
    manageLabels: 'Manage labels…',
    ctrlEnter: 'Ctrl+Enter',
  },
})

/** Creazione di un elemento: titolo, descrizione e attributi (con nome e spiegazione), in un dialog. */
const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ manageLabels: [] }>()
/**
 * "Gestisci etichette…": il nuovo task lascia il posto alla finestra delle
 * etichette e, alla sua chiusura, si riapre con quanto già inserito.
 */
let keepDraft = false
function openLabels() {
  keepDraft = true
  open.value = false
  emit('manageLabels')
}
const ws = useWorkspaceStore()
const ui = useUiStore()

const title = ref('')
const notes = ref('')
const priority = ref<Priority>('media')
const status = ref<Status>('da_valutare')
const dueDate = ref<string | null>(null)
const labelId = ref<string | null>(null)
const assigneeId = ref<string | null>(null)
const error = ref('')

/** Pallini dei valori scelti, come nella lista. */
const statusDot: Record<Status, string> = {
  da_valutare: 'border-ink-3',
  da_definire: 'border-accent [background:linear-gradient(90deg,var(--accent)_50%,transparent_50%)]',
  confermato: 'border-accent bg-accent',
}
const label = computed(() => (labelId.value ? ws.labelsById[labelId.value] : null))

watch(open, (o) => {
  if (!o) return
  if (keepDraft) {
    // Di ritorno dalle etichette: si tiene tutto, salvo un'etichetta nel frattempo eliminata
    keepDraft = false
    if (labelId.value && !ws.labelsById[labelId.value]) labelId.value = null
    return
  }
  title.value = ''
  notes.value = ''
  priority.value = 'media'
  status.value = 'da_valutare'
  dueDate.value = null
  labelId.value = null
  assigneeId.value = null
  error.value = ''
})

async function submit() {
  const t = title.value.trim()
  if (!t) return (error.value = m.errTitle)
  const item = await ws.addItem(props.projectId, {
    title: t,
    notes: notes.value.trim(),
    priority: priority.value,
    status: status.value,
    dueDate: dueDate.value,
    labelId: labelId.value,
    assigneeId: assigneeId.value,
  })
  open.value = false
  ui.toast(m.created, 'success', { label: common.actions.open, run: () => (ui.selectedItemId = item.id) }, 2500)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <form class="space-y-4" @submit.prevent="submit()">
      <div>
        <label class="label" for="i-title">{{ m.titleLabel }}</label>
        <input id="i-title" v-model="title" class="field text-[14.5px] font-semibold" :placeholder="m.titlePlaceholder" data-autofocus @keydown.ctrl.enter.prevent="submit()" />
      </div>
      <div>
        <label class="label" for="i-notes">{{ m.notes }}</label>
        <textarea id="i-notes" v-model="notes" class="field min-h-24 resize-y text-[13.5px] leading-relaxed" :placeholder="m.notesPlaceholder" @keydown.ctrl.enter.prevent="submit()" />
      </div>

      <fieldset class="rounded-lg border border-line p-4">
        <legend class="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{{ m.details }}</legend>
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <!-- Priorità -->
          <div>
            <label class="label flex items-center gap-1.5" for="i-priority"><Flag :size="13" class="text-ink-3" /> {{ m.priority }}</label>
            <div class="relative">
              <span class="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" :class="`bg-p-${priority}`" />
              <select id="i-priority" v-model="priority" class="field pl-8">
                <option v-for="p in PRIORITIES" :key="p" :value="p">{{ PRIORITY_LABEL[p] }}</option>
              </select>
            </div>
            <p class="mt-1 text-[11.5px] text-ink-3">{{ m.priorityHint }}</p>
          </div>
          <!-- Stato -->
          <div>
            <label class="label flex items-center gap-1.5" for="i-status"><CircleDot :size="13" class="text-ink-3" /> {{ m.status }}</label>
            <div class="relative">
              <span class="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-[1.5px]" :class="statusDot[status]" />
              <select id="i-status" v-model="status" class="field pl-8">
                <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
              </select>
            </div>
            <p class="mt-1 text-[11.5px] text-ink-3">{{ m.statusHint }}</p>
          </div>
          <!-- Scadenza -->
          <div>
            <label class="label flex items-center gap-1.5" for="i-due"><CalendarDays :size="13" class="text-ink-3" /> {{ m.dueDate }}</label>
            <div class="flex gap-1.5">
              <input id="i-due" type="date" class="field" :value="dueDate ?? ''" @change="dueDate = ($event.target as HTMLInputElement).value || null" />
              <BaseButton v-if="dueDate" size="icon" variant="ghost" :title="m.clearDue" :aria-label="m.clearDue" @click="dueDate = null"><X :size="15" /></BaseButton>
            </div>
            <p class="mt-1 text-[11.5px] text-ink-3">{{ m.dueHint }}</p>
          </div>
          <!-- Assegnato a -->
          <div>
            <label class="label flex items-center gap-1.5" for="i-assignee"><UserRound :size="13" class="text-ink-3" /> {{ m.assignee }}</label>
            <select id="i-assignee" class="field" :value="assigneeId ?? ''" @change="assigneeId = ($event.target as HTMLSelectElement).value || null">
              <option value="">{{ m.unassigned }}</option>
              <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
            </select>
            <p class="mt-1 text-[11.5px] text-ink-3">{{ m.assigneeHint }}</p>
          </div>
          <!-- Etichetta -->
          <div class="sm:col-span-2">
            <div class="flex items-center justify-between">
              <label class="label flex items-center gap-1.5" for="i-label"><Tag :size="13" class="text-ink-3" /> {{ m.label }}</label>
              <button type="button" class="mb-1 text-[12px] font-medium text-accent-ink hover:underline" @click="openLabels">{{ m.manageLabels }}</button>
            </div>
            <div class="relative">
              <span
                class="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                :style="{ background: label?.color ?? 'transparent', boxShadow: label ? 'none' : 'inset 0 0 0 1.5px var(--ink-3)' }"
              />
              <select id="i-label" class="field pl-8" :value="labelId ?? ''" @change="labelId = ($event.target as HTMLSelectElement).value || null">
                <option value="">{{ m.noLabel }}</option>
                <option v-for="l in ws.tree.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
            </div>
            <p class="mt-1 text-[11.5px] text-ink-3">{{ m.labelHint }}</p>
          </div>
        </div>
      </fieldset>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="!title.trim()" :title="m.ctrlEnter" @click="submit()">{{ common.actions.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
