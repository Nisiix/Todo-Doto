<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Check, CircleHelp, MessageSquare } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import PrioritySelect from './PrioritySelect.vue'
import StatusSelect from './StatusSelect.vue'
import DueDateField from './DueDateField.vue'
import LabelSelect from './LabelSelect.vue'
import LabelBadge from './LabelBadge.vue'
import ItemRowActions from './ItemRowActions.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useItemActions } from '@/composables/useItemActions'
import { dueState, firstLine, formatDue, openQuestions as openQuestionsOf } from '@/services/items'
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type Priority, type Status } from '@/types'
import { DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    assignedTo: (n: string) => `Assegnato a ${n}`,
    createdBy: (n: string) => `Creato da ${n}`,
    markDone: 'Segna come completato (C)',
    openQuestions: 'Domande aperte',
    comments: 'Commenti',
    completed: 'completato',
    trashed: 'cestinato',
  },
  en: {
    assignedTo: (n: string) => `Assigned to ${n}`,
    createdBy: (n: string) => `Created by ${n}`,
    markDone: 'Mark as completed (C)',
    openQuestions: 'Open questions',
    comments: 'Comments',
    completed: 'completed',
    trashed: 'trashed',
  },
})

/**
 * Una riga della lista. Mostra titolo, persona, contatori e gli attributi
 * modificabili in linea; le azioni (completa, cestina…) stanno in
 * ItemRowActions e nella tastiera (↑/↓ sposta, Invio apre, C completa, Canc cestina).
 */
const props = defineProps<{ item: Item; projectId: string; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const actions = useItemActions(
  () => props.item,
  () => props.projectId,
  () => props.readOnly,
)

const selected = computed(() => ui.selectedItemId === props.item.id)
const openQuestions = computed(() => openQuestionsOf(props.item).length)
const editable = computed(() => !props.readOnly && props.item.bucket === 'todo')
/** Con il pannello di dettaglio aperto la riga è stretta: controlli ridotti ai minimi. */
const compact = computed(() => ui.selectedItemId !== null)
const label = computed(() => (props.item.labelId ? ws.labelsById[props.item.labelId] : null))
const personName = computed(() => ws.userName(props.item.assigneeId ?? props.item.createdBy))
const personLabel = computed(() => (props.item.assigneeId ? m.assignedTo(personName.value) : m.createdBy(personName.value)))
const barHeight: Record<Priority, string> = { bassa: 'h-2', media: 'h-3.5', alta: 'h-5', immediata: 'h-7' }

const setPriority = (p: Priority) => ws.updateItem(props.projectId, props.item.id, { priority: p })
const setStatus = (s: Status) => ws.updateItem(props.projectId, props.item.id, { status: s })
const setDue = (d: string | null) => ws.updateItem(props.projectId, props.item.id, { dueDate: d })
const setLabel = (l: string | null) => ws.updateItem(props.projectId, props.item.id, { labelId: l })

// --- tastiera -------------------------------------------------------------------
const ROW = '[data-item-row]'
function siblingRow(from: HTMLElement, dir: 1 | -1): HTMLElement | null {
  const rows = [...(from.parentElement?.querySelectorAll<HTMLElement>(ROW) ?? [])]
  const i = rows.indexOf(from)
  return rows[i + dir] ?? null
}
function onKeydown(e: KeyboardEvent) {
  // Solo quando il fuoco è sulla riga stessa, non su un select al suo interno.
  if (e.target !== e.currentTarget) return
  const el = e.currentTarget as HTMLElement
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    siblingRow(el, e.key === 'ArrowDown' ? 1 : -1)?.focus()
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    ui.selectedItemId = selected.value && e.key === ' ' ? null : props.item.id
  } else if (actions.handleKey(e)) {
    e.preventDefault()
    // La riga sparisce dalla lista: il fuoco passa alla successiva (o precedente).
    ;(siblingRow(el, 1) ?? siblingRow(el, -1))?.focus()
  }
}
</script>

<template>
  <div
    class="group relative flex h-11 items-center gap-3 rounded-md pl-4 pr-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    :class="[selected ? 'bg-accent-soft/70' : 'hover:bg-surface-2', { 'flash-row': ui.flash.has(item.id) }]"
    role="button"
    tabindex="0"
    data-item-row
    @click="ui.selectedItemId = selected ? null : item.id"
    @keydown="onKeydown"
  >
    <!-- Barra di priorità: l'altezza è la priorità -->
    <span
      class="absolute left-1 top-1/2 w-1 -translate-y-1/2 rounded-full transition-[height]"
      :class="[barHeight[item.priority], `bg-p-${item.priority}`, { 'opacity-40': item.bucket !== 'todo' }]"
    />

    <!-- Il cerchio di completamento esiste solo in "Da fare" -->
    <button
      v-if="item.bucket === 'todo'"
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition-colors enabled:hover:border-ok enabled:hover:text-ok disabled:opacity-50"
      :title="m.markDone"
      :disabled="readOnly"
      tabindex="-1"
      @click.stop="actions.complete()"
    >
      <Check :size="12" stroke-width="3" />
    </button>

    <span class="min-w-0 flex-1 truncate text-[13.5px]" :class="{ 'text-ink-3 line-through decoration-line-strong': item.bucket === 'done', 'text-ink-3': item.bucket === 'trash' }" :title="item.title">
      {{ firstLine(item.title) }}
    </span>
    <!-- L'etichetta resta visibile anche in modalità compatta: è un colore, non costa spazio -->
    <LabelBadge v-if="!editable || compact" :label-id="item.labelId" />

    <span class="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-2" :title="personLabel">
      <UserAvatar :name="personName" size="xs" />
      <span v-if="!compact" class="max-w-36 truncate">{{ personName }}</span>
    </span>

    <span v-if="item.comments.length || openQuestions" class="flex shrink-0 items-center gap-2 text-[11.5px] tabular-nums text-ink-3">
      <span v-if="openQuestions" class="flex items-center gap-0.5 text-p-media" :title="m.openQuestions"><CircleHelp :size="13" /> {{ openQuestions }}</span>
      <span v-if="item.comments.length" class="flex items-center gap-0.5" :title="m.comments"><MessageSquare :size="13" /> {{ item.comments.length }}</span>
    </span>

    <template v-if="editable && !compact">
      <LabelSelect :model-value="item.labelId" @update:model-value="setLabel" />
      <DueDateField :model-value="item.dueDate" @update:model-value="setDue" />
      <StatusSelect :model-value="item.status" @update:model-value="setStatus" />
      <PrioritySelect :model-value="item.priority" @update:model-value="setPriority" />
    </template>
    <span v-else-if="editable" class="flex shrink-0 items-center gap-2 whitespace-nowrap text-[12px] text-ink-3" :title="`${STATUS_LABEL[item.status]} · ${PRIORITY_LABEL[item.priority]}${label ? ' · ' + label.name : ''}`">
      <span v-if="item.dueDate" class="tabular-nums" :class="{ 'font-semibold text-danger': dueState(item.dueDate) === 'overdue' }">{{ formatDue(item.dueDate) }}</span>
      <span class="h-2.5 w-2.5 rounded-full border-[1.5px]" :class="item.status === 'confermato' ? 'border-accent bg-accent' : item.status === 'da_definire' ? 'border-accent [background:linear-gradient(90deg,var(--accent)_50%,transparent_50%)]' : 'border-ink-3'" />
      <span class="h-2.5 w-2.5 rounded-full" :class="`bg-p-${item.priority}`" />
    </span>
    <span v-else class="flex shrink-0 items-center gap-2 whitespace-nowrap text-[12px] text-ink-3">
      <span v-if="item.dueDate" class="tabular-nums">{{ dayjs(item.dueDate).format(DATE.dayMonth) }}</span>
      <span>{{ STATUS_LABEL[item.status] }}</span>
      <span>{{ PRIORITY_LABEL[item.priority] }}</span>
      <span v-if="item.bucket !== 'todo'">
        · {{ item.bucket === 'done' ? m.completed : m.trashed }} {{ dayjs(item.completedAt ?? item.trashedAt ?? item.createdAt).fromNow() }}
      </span>
    </span>

    <ItemRowActions :item="item" :project-id="projectId" :read-only="readOnly" />
  </div>
</template>
