<script setup lang="ts">
import { ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { Copy as CopyIcon } from 'lucide-vue-next'
import { useAiStore, withAi } from '@/stores/ai'
import { itemText, nearest, SIMILAR_THRESHOLD } from '@/services/aiAssist'
import { firstLine } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import { BUCKET_LABEL, type Item } from '@/types'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemFields from '@/components/board/ItemFields.vue'
import QuickAddChips from '@/components/quick/QuickAddChips.vue'
import { useQuickAdd } from '@/composables/useQuickAdd'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import type { Priority, Status } from '@/types'
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
    ctrlEnter: 'Ctrl+Invio',
    similar: 'Task simili già presenti: controlla che non sia un doppione.',
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
    ctrlEnter: 'Ctrl+Enter',
    similar: 'Similar tasks already exist: check it is not a duplicate.',
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

// Inserimento rapido anche nel titolo: !alta @mario #bug entro venerdì compilano i campi sotto
const { parsed, keep } = useQuickAdd(title, () => props.projectId)
const milestoneId = ref<string | null>(null)
const estimateHours = ref<number | null>(null)
watch(
  () => parsed.value.tokens.map((t) => `${t.kind}:${t.value}`).join('|'),
  () => {
    const p = parsed.value
    if (p.priority) priority.value = p.priority
    if (p.assigneeId) assigneeId.value = p.assigneeId
    if (p.labelId) labelId.value = p.labelId
    if (p.milestoneId) milestoneId.value = p.milestoneId
    if (p.estimateHours !== null) estimateHours.value = p.estimateHours
    if (p.dueDate) {
      status.value = 'confermato'
      dueDate.value = p.dueDate
    }
  },
)

// Task simili già presenti (IA locale, per significato): solo un avviso, non blocca nulla
const ai = useAiStore()
const similar = ref<Item[]>([])
let similarRun = 0
watchDebounced(
  [title, notes, open],
  async () => {
    const run = ++similarRun
    const text = `${title.value}\n${notes.value}`.trim()
    if (!open.value || !ai.active || title.value.trim().length < 6) return void (similar.value = [])
    const items = (ws.projects[props.projectId]?.items ?? []).filter((i) => i.bucket !== 'trash')
    const found = await withAi((cfg) => nearest(cfg, text, items.map((i) => ({ value: i, text: itemText(i) })), { mode: 'similar', threshold: SIMILAR_THRESHOLD, max: 3 }))
    if (run === similarRun) similar.value = (found ?? []).map((f) => f.value)
  },
  { debounce: 700 },
)


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
  milestoneId.value = null
  estimateHours.value = null
  error.value = ''
  similar.value = []
})

async function submit() {
  const t = parsed.value.title
  if (!t) return (error.value = m.errTitle)
  const item = await ws.addItem(props.projectId, {
    title: t,
    notes: notes.value.trim(),
    priority: priority.value,
    status: status.value,
    dueDate: dueDate.value,
    labelId: labelId.value,
    assigneeId: assigneeId.value,
    milestoneId: milestoneId.value,
    estimateHours: estimateHours.value,
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
        <QuickAddChips class="mt-1.5" :parsed="parsed" @remove="keep" />
        <div v-if="similar.length" class="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[12.5px]" data-similar-tasks>
          <p class="flex items-center gap-1.5 font-medium text-p-alta"><CopyIcon :size="12" /> {{ m.similar }}</p>
          <p v-for="s in similar" :key="s.id" class="truncate text-ink-2">
            <span v-if="s.seq" class="font-mono text-[11.5px] text-ink-3">{{ taskCode(s.seq) }}</span> {{ firstLine(s.title) }} <span class="text-ink-3">· {{ BUCKET_LABEL[s.bucket] }}</span>
          </p>
        </div>
      </div>
      <div>
        <label class="label" for="i-notes">{{ m.notes }}</label>
        <textarea id="i-notes" v-model="notes" class="field min-h-24 resize-y text-[13.5px] leading-relaxed" :placeholder="m.notesPlaceholder" @keydown.ctrl.enter.prevent="submit()" />
      </div>

      <fieldset class="rounded-lg border border-line p-4">
        <legend class="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{{ m.details }}</legend>
        <ItemFields
          v-model:priority="priority"
          v-model:status="status"
          v-model:due-date="dueDate"
          v-model:label-id="labelId"
          v-model:assignee-id="assigneeId"
          id-prefix="i"
          wide
          @manage-labels="openLabels"
        />
      </fieldset>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="!title.trim()" :title="m.ctrlEnter" @click="submit()">{{ common.actions.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
