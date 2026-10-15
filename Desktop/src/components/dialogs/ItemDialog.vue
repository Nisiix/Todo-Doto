<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import PrioritySelect from '@/components/board/PrioritySelect.vue'
import StatusSelect from '@/components/board/StatusSelect.vue'
import DueDateField from '@/components/board/DueDateField.vue'
import LabelSelect from '@/components/board/LabelSelect.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import type { Priority, Status } from '@/types'

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
  error.value = ''
})

async function submit(keepOpen = false) {
  const titleText = title.value.trim()
  if (!titleText) return (error.value = t('Dai un titolo all’elemento.'))
  const item = await ws.addItem(props.projectId, {
    title: titleText,
    notes: notes.value.trim(),
    priority: priority.value,
    status: status.value,
    dueDate: dueDate.value,
    labelId: labelId.value,
  })
  if (keepOpen) {
    title.value = ''
    notes.value = ''
    error.value = ''
    ui.toast(t('Aggiunto «{title}»', { title: titleText }), 'success', undefined, 1800)
  } else {
    open.value = false
    ui.toast(t('Aggiunto'), 'success', { label: t('Apri'), run: () => (ui.selectedItemId = item.id) }, 2500)
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="t('Nuovo elemento')" :description="t('Un titolo breve per la lista; i dettagli nella descrizione.')">
    <form class="space-y-4" @submit.prevent="submit(addAnother)">
      <div>
        <label class="label" for="i-title">{{ t('Titolo') }}</label>
        <input id="i-title" v-model="title" class="field" :placeholder="t('Es. Export XBRL con validazione')" data-autofocus @keydown.ctrl.enter.prevent="submit(addAnother)" />
      </div>
      <div>
        <label class="label" for="i-notes">{{ t('Descrizione') }}</label>
        <textarea id="i-notes" v-model="notes" class="field min-h-24 resize-y text-[13.5px] leading-relaxed" :placeholder="t('Cosa va fatto, decisioni, riferimenti… (facoltativa)')" @keydown.ctrl.enter.prevent="submit(addAnother)" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <PrioritySelect v-model="priority" />
        <StatusSelect v-model="status" />
        <DueDateField v-model="dueDate" />
        <LabelSelect v-model="labelId" @manage="emit('manageLabels')" />
      </div>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <label class="mr-auto flex items-center gap-2 text-[12.5px] text-ink-2">
        <input v-model="addAnother" type="checkbox" class="accent-accent" /> {{ t('Aggiungine un altro dopo') }}
      </label>
      <BaseButton variant="ghost" @click="open = false">{{ t('Annulla') }}</BaseButton>
      <BaseButton variant="primary" :disabled="!title.trim()" :title="t('Ctrl+Invio')" @click="submit(addAnother)">{{ t('Aggiungi') }}</BaseButton>
    </template>
  </BaseDialog>
</template>
