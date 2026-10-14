<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import PrioritySelect from '@/components/board/PrioritySelect.vue'
import StatusSelect from '@/components/board/StatusSelect.vue'
import DueDateField from '@/components/board/DueDateField.vue'
import LabelSelect from '@/components/board/LabelSelect.vue'
import AssigneeSelect from '@/components/board/AssigneeSelect.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import type { Priority, Status } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    errTitle: 'Dai un titolo all’elemento.',
    createdNamed: (t: string) => `Creato «${t}»`,
    created: 'Task creato',
    title: 'Nuovo task',
    description: 'Un titolo breve per la lista; i dettagli nella descrizione.',
    titleLabel: 'Titolo',
    titlePlaceholder: 'Es. Pagina di accesso con verifica email',
    notes: 'Descrizione',
    notesPlaceholder: 'Cosa va fatto, decisioni, riferimenti… (facoltativa)',
    manageLabels: 'Gestisci etichette…',
    addAnother: 'Creane un altro dopo',
    ctrlEnter: 'Ctrl+Invio',
  },
  en: {
    errTitle: 'Give the item a title.',
    createdNamed: (t: string) => `Created “${t}”`,
    created: 'Task created',
    title: 'New task',
    description: 'A short title for the list; the details go in the description.',
    titleLabel: 'Title',
    titlePlaceholder: 'E.g. Sign-in page with email verification',
    notes: 'Description',
    notesPlaceholder: 'What needs doing, decisions, references… (optional)',
    manageLabels: 'Manage labels…',
    addAnother: 'Create another one after',
    ctrlEnter: 'Ctrl+Enter',
  },
})

/** Creazione di un elemento: titolo, descrizione e attributi, in un dialog. */
const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ manageLabels: [] }>()
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
const addAnother = ref(false)

watch(open, (o) => {
  if (!o) return
  title.value = ''
  notes.value = ''
  priority.value = 'media'
  status.value = 'da_valutare'
  dueDate.value = null
  labelId.value = null
  assigneeId.value = null
  error.value = ''
})

async function submit(keepOpen = false) {
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
  if (keepOpen) {
    title.value = ''
    notes.value = ''
    error.value = ''
    ui.toast(m.createdNamed(t), 'success', undefined, 1800)
  } else {
    open.value = false
    ui.toast(m.created, 'success', { label: common.actions.open, run: () => (ui.selectedItemId = item.id) }, 2500)
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description">
    <form class="space-y-4" @submit.prevent="submit(addAnother)">
      <div>
        <label class="label" for="i-title">{{ m.titleLabel }}</label>
        <input id="i-title" v-model="title" class="field" :placeholder="m.titlePlaceholder" data-autofocus @keydown.ctrl.enter.prevent="submit(addAnother)" />
      </div>
      <div>
        <label class="label" for="i-notes">{{ m.notes }}</label>
        <textarea id="i-notes" v-model="notes" class="field min-h-24 resize-y text-[13.5px] leading-relaxed" :placeholder="m.notesPlaceholder" @keydown.ctrl.enter.prevent="submit(addAnother)" />
      </div>
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <PrioritySelect v-model="priority" />
          <StatusSelect v-model="status" />
          <DueDateField v-model="dueDate" />
          <LabelSelect v-model="labelId" />
          <AssigneeSelect v-model="assigneeId" />
        </div>
        <button type="button" class="mt-2 text-[12px] font-medium text-accent-ink hover:underline" @click="emit('manageLabels')">{{ m.manageLabels }}</button>
      </div>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <label class="mr-auto flex items-center gap-2 text-[12.5px] text-ink-2">
        <input v-model="addAnother" type="checkbox" class="accent-accent" /> {{ m.addAnother }}
      </label>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="!title.trim()" :title="m.ctrlEnter" @click="submit(addAnother)">{{ common.actions.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
