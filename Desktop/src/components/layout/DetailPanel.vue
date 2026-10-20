<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Check, Lock, Mail, RotateCcw, Trash2, X } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BaseButton from '@/components/ui/BaseButton.vue'
import LabelBadge from '@/components/board/LabelBadge.vue'
import ItemFields from '@/components/board/ItemFields.vue'
import ItemComments from '@/components/detail/ItemComments.vue'
import ItemQuestions from '@/components/detail/ItemQuestions.vue'
import GitTaskHint from '@/components/detail/GitTaskHint.vue'
import GitTaskActivity from '@/components/detail/GitTaskActivity.vue'
import ItemDependencies from '@/components/detail/ItemDependencies.vue'
import ItemPlanning from '@/components/detail/ItemPlanning.vue'
import HandoffNote from '@/components/detail/HandoffNote.vue'
import ItemChecklist from '@/components/detail/ItemChecklist.vue'
import WorkingOn from '@/components/detail/WorkingOn.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useItemActions } from '@/composables/useItemActions'
import { getFs } from '@/services/fs'
import { mailtoLink } from '@/services/office'
import { firstLine } from '@/services/items'
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type Priority, type Project, type Status } from '@/types'
import { DATE, defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    lockProject: 'Progetto nel cestino: ripristinalo per modificare.',
    lockDone: 'Elemento completato: riaprilo per modificare.',
    lockTrash: 'Elemento nel cestino: ripristinalo per modificare.',
    saved: 'Salvato',
    unsaved: 'Modifiche non salvate',
    complete: 'Completa',
    restore: 'Ripristina',
    closeEsc: 'Chiudi (Esc)',
    title: 'Titolo',
    due: (d: string) => `scadenza ${d}`,
    assignedTo: (n: string) => `assegnato a ${n}`,
    createdBy: (s: string) => `Creato da ${s}`,
    description: 'Descrizione',
    notesPlaceholder: 'Dettagli, decisioni, riferimenti…',
    mailHint: 'Apre il programma di posta con il task (titolo, stato, scadenza, descrizione)',
    mailFacts: (p: string, s: string, pr: string) => `Progetto: ${p}\nStato: ${s} · Priorità: ${pr}`,
  },
  en: {
    lockProject: 'Project in the trash: restore it to make changes.',
    lockDone: 'Completed item: reopen it to make changes.',
    lockTrash: 'Item in the trash: restore it to make changes.',
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    complete: 'Complete',
    restore: 'Restore',
    closeEsc: 'Close (Esc)',
    title: 'Title',
    due: (d: string) => `due ${d}`,
    assignedTo: (n: string) => `assigned to ${n}`,
    createdBy: (s: string) => `Created by ${s}`,
    description: 'Description',
    notesPlaceholder: 'Details, decisions, references…',
    mailHint: 'Opens the mail program with the task (title, status, due date, description)',
    mailFacts: (p: string, s: string, pr: string) => `Project: ${p}\nStatus: ${s} · Priority: ${pr}`,
  },
})

const props = defineProps<{ project: Project; item: Item; readOnly?: boolean }>()
const emit = defineEmits<{ manageLabels: [] }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
/** Stesse azioni (e stessi permessi) della riga e del suo menu. */
const actions = useItemActions(
  () => props.item,
  () => props.project.id,
  () => props.readOnly,
)

/** Elementi completati o cestinati (e progetti nel cestino) sono in sola lettura. */
const locked = computed(() => props.readOnly || props.item.bucket !== 'todo')
const lockReason = computed(() => {
  if (props.readOnly) return m.lockProject
  if (props.item.bucket === 'done') return m.lockDone
  if (props.item.bucket === 'trash') return m.lockTrash
  return ''
})

// Titolo, descrizione e attributi (priorità, stato, scadenza, etichetta,
// assegnatario) si modificano in locale e si salvano insieme con "Salva" (o si
// annullano): un aggiornamento remoto non cancella quello che si sta scrivendo.
const title = ref(props.item.title)
const notes = ref(props.item.notes)
const priority = ref<Priority>(props.item.priority)
const status = ref<Status>(props.item.status)
const dueDate = ref<string | null>(props.item.dueDate)
const labelId = ref<string | null>(props.item.labelId)
const assigneeId = ref<string | null>(props.item.assigneeId)
const dirty = computed(
  () =>
    title.value !== props.item.title ||
    notes.value !== props.item.notes ||
    priority.value !== props.item.priority ||
    status.value !== props.item.status ||
    dueDate.value !== props.item.dueDate ||
    labelId.value !== props.item.labelId ||
    assigneeId.value !== props.item.assigneeId,
)
function load(it: Item) {
  title.value = it.title
  notes.value = it.notes
  priority.value = it.priority
  status.value = it.status
  dueDate.value = it.dueDate
  labelId.value = it.labelId
  assigneeId.value = it.assigneeId
}
const titleEl = ref<HTMLTextAreaElement | null>(null)

function autosizeTitle() {
  const el = titleEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch(
  () => props.item,
  (it) => {
    if (!dirty.value) {
      load(it)
      requestAnimationFrame(autosizeTitle)
    } else if (labelId.value && !ws.labelsById[labelId.value]) labelId.value = null // etichetta eliminata nel frattempo
  },
)
watch(title, () => requestAnimationFrame(autosizeTitle), { immediate: true })

/** Passaggio di consegne: dopo aver passato il task da una persona a un'altra si propone una nota. */
const handoff = ref<{ from: string; to: string } | null>(null)
async function save() {
  const t = title.value.trim()
  if (!t) return
  const from = props.item.assigneeId
  const to = assigneeId.value
  if (from && to && from !== to && to !== ws.currentUser?.id) handoff.value = { from, to }
  await ws.updateItem(props.project.id, props.item.id, {
    title: t,
    notes: notes.value,
    priority: priority.value,
    status: status.value,
    dueDate: dueDate.value,
    labelId: labelId.value,
    assigneeId: assigneeId.value,
  })
  title.value = t
  ui.toast(m.saved, 'success', undefined, 1800)
}
function discard() {
  load(props.item)
}

/** «Invia per email»: apre il programma di posta (nessuna connessione dall'app). */
async function mailItem() {
  const it = props.item
  const lines = [
    it.title,
    '',
    m.mailFacts(props.project.name, STATUS_LABEL[it.status], PRIORITY_LABEL[it.priority]),
    it.dueDate ? m.due(dayjs(it.dueDate).format(DATE.date)) : '',
    it.assigneeId ? m.assignedTo(ws.userName(it.assigneeId)) : '',
    it.notes ? `\n${it.notes}` : '',
  ].filter(Boolean)
  await (await getFs()).openExternal(mailtoLink([], `[${props.project.name}] ${firstLine(it.title)}`, lines.join('\n')), 'link')
}

const close = () => (ui.selectedItemId = null)
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('textarea, input, [role=dialog]')) close()
  if (e.key === 's' && (e.ctrlKey || e.metaKey) && dirty.value && !locked.value) {
    e.preventDefault()
    void save()
  }
})

const created = computed(() => `${ws.userName(props.item.createdBy)}, ${dayjs(props.item.createdAt).format(DATE.date)}`)
</script>

<template>
  <aside class="flex h-full w-[420px] shrink-0 flex-col border-l border-line bg-surface">
    <div class="flex items-center gap-1 border-b border-line px-3 py-2">
      <span class="h-5 w-1 rounded-full" :class="`bg-p-${item.priority}`" />
      <span class="ml-1 flex-1 truncate text-[12px] text-ink-3">{{ project.name }}</span>
      <BaseButton v-if="actions.canComplete.value" size="sm" variant="ghost" :title="common.item.markDone" @click="actions.complete()"><Check :size="14" /> {{ m.complete }}</BaseButton>
      <BaseButton v-if="actions.canReopen.value" size="sm" variant="ghost" @click="actions.reopen()">
        <RotateCcw :size="14" /> {{ item.bucket === 'done' ? common.item.reopen : m.restore }}
      </BaseButton>
      <BaseButton size="icon-sm" variant="ghost" :title="`${common.actions.sendByEmail}: ${m.mailHint}`" data-item-mail @click="mailItem"><Mail :size="14" /></BaseButton>
      <BaseButton v-if="actions.canTrash.value" size="icon-sm" variant="ghost" :title="common.item.moveToTrash" @click="actions.trash()"><Trash2 :size="14" /></BaseButton>
      <BaseButton size="icon-sm" variant="ghost" :title="m.closeEsc" @click="close"><X :size="15" /></BaseButton>
    </div>

    <div v-if="locked" class="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[12.5px] text-ink-2">
      <Lock :size="13" class="shrink-0" /> {{ lockReason }}
    </div>

    <div class="flex-1 space-y-6 overflow-y-auto px-5 py-4">
      <div>
        <textarea
          ref="titleEl"
          v-model="title"
          rows="1"
          class="w-full resize-none bg-transparent text-[18px] font-bold leading-snug tracking-tight focus:outline-none disabled:text-ink-2"
          :class="{ 'line-through': item.bucket === 'done' }"
          :disabled="locked"
          :aria-label="m.title"
        />
        <!-- Gli stessi campi, con nome e spiegazione, del dialog "Nuovo task"; si salvano con «Salva» -->
        <ItemFields
          v-if="!locked"
          v-model:priority="priority"
          v-model:status="status"
          v-model:due-date="dueDate"
          v-model:label-id="labelId"
          v-model:assignee-id="assigneeId"
          class="mt-3"
          id-prefix="d"
          :project-id="project.id"
          @manage-labels="emit('manageLabels')"
        />
        <div v-else class="mt-2 flex flex-wrap items-center gap-1.5">
          <LabelBadge :label-id="item.labelId" />
          <span class="text-[12.5px] text-ink-2">
            {{ PRIORITY_LABEL[item.priority] }} · {{ STATUS_LABEL[item.status] }}
            <template v-if="item.dueDate"> · {{ m.due(dayjs(item.dueDate).format(DATE.date)) }}</template>
            <template v-if="item.assigneeId"> · {{ m.assignedTo(ws.userName(item.assigneeId)) }}</template>
          </span>
        </div>
        <p class="mt-2 text-[12px] text-ink-3">{{ m.createdBy(created) }}</p>
        <HandoffNote v-if="handoff && !locked" class="mt-3" :item="item" :project="project" :from-id="handoff.from" :to-id="handoff.to" @done="handoff = null" />
        <WorkingOn v-if="!readOnly" class="mt-3" :item="item" :project="project" />
        <GitTaskHint class="mt-3" :item="item" :project="project" />
        <GitTaskActivity class="mt-3" :item="item" :project="project" />
      </div>

      <div>
        <h3 class="mb-1.5 text-[13px] font-semibold text-ink-2">{{ m.description }}</h3>
        <textarea
          v-model="notes"
          class="field min-h-20 resize-y text-[13.5px] leading-relaxed"
          :placeholder="locked ? '' : m.notesPlaceholder"
          :disabled="locked"
          :aria-label="m.description"
        />
        <!-- Salva / Annulla: per titolo, descrizione e attributi insieme -->
        <div v-if="!locked && dirty" class="mt-2 flex items-center justify-end gap-2" data-detail-save>
          <span class="mr-auto text-[11.5px] font-semibold text-p-alta">{{ m.unsaved }}</span>
          <span class="text-[11.5px] text-ink-3">Ctrl+S</span>
          <BaseButton variant="ghost" size="sm" @click="discard">{{ common.actions.cancel }}</BaseButton>
          <BaseButton variant="primary" size="sm" :disabled="!title.trim()" @click="save">{{ common.actions.save }}</BaseButton>
        </div>
      </div>

      <ItemChecklist :item="item" :project="project" :read-only="locked" />
      <ItemPlanning :item="item" :project="project" :read-only="locked" />
      <ItemDependencies :item="item" :project="project" :read-only="locked" />
      <ItemQuestions :item="item" :project-id="project.id" :read-only="locked" />
      <ItemComments :item="item" :project-id="project.id" :read-only="locked" />
    </div>
  </aside>
</template>
