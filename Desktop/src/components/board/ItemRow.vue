<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Check, CircleHelp, MessageSquare, RotateCcw, Trash2, Undo2, X } from 'lucide-vue-next'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import PrioritySelect from './PrioritySelect.vue'
import StatusSelect from './StatusSelect.vue'
import DueDateField from './DueDateField.vue'
import LabelSelect from './LabelSelect.vue'
import LabelBadge from './LabelBadge.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { dueState, firstLine, formatDue, openQuestions as openQuestionsOf } from '@/services/items'
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type Priority, type Status } from '@/types'

const props = defineProps<{ item: Item; projectId: string; readOnly?: boolean }>()
const emit = defineEmits<{ manageLabels: [] }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

const selected = computed(() => ui.selectedItemId === props.item.id)
const openQuestions = computed(() => openQuestionsOf(props.item).length)
const editable = computed(() => !props.readOnly && props.item.bucket === 'todo')
/** Con il pannello di dettaglio aperto la riga è stretta: controlli ridotti ai minimi. */
const compact = computed(() => ui.selectedItemId !== null)
const label = computed(() => (props.item.labelId ? ws.labelsById[props.item.labelId] : null))
const authorName = computed(() => ws.userName(props.item.assigneeId ?? props.item.createdBy))
const personLabel = computed(() => (props.item.assigneeId ? `Assegnato a ${authorName.value}` : `Creato da ${authorName.value}`))
const barHeight: Record<Priority, string> = { bassa: 'h-2', media: 'h-3.5', alta: 'h-5', immediata: 'h-7' }

const setPriority = (p: Priority) => ws.updateItem(props.projectId, props.item.id, { priority: p })
const setStatus = (s: Status) => ws.updateItem(props.projectId, props.item.id, { status: s })
const setDue = (d: string | null) => ws.updateItem(props.projectId, props.item.id, { dueDate: d })
const setLabel = (l: string | null) => ws.updateItem(props.projectId, props.item.id, { labelId: l })

const complete = () => ws.moveItem(props.projectId, props.item.id, 'done')
const reopen = () => ws.moveItem(props.projectId, props.item.id, 'todo')
function trash() {
  ws.moveItem(props.projectId, props.item.id, 'trash')
  ui.toast('Spostato nel cestino', 'info', { label: 'Annulla', run: () => ws.moveItem(props.projectId, props.item.id, 'todo') })
}
async function deleteForever() {
  const ok = await confirm({
    title: `Eliminare definitivamente «${firstLine(props.item.title)}»?`,
    message: 'Commenti, domande e tutto il resto andranno persi. Non si può annullare.',
    confirmLabel: 'Elimina per sempre',
    danger: true,
  })
  if (ok) {
    if (selected.value) ui.selectedItemId = null
    await ws.deleteItemForever(props.projectId, props.item.id)
  }
}

const menu = computed(() => {
  if (props.readOnly) return []
  const b = props.item.bucket
  const trashEntry = ws.canTrashItem(props.item) ? [{ label: 'Sposta nel cestino', icon: Trash2, danger: true, onSelect: trash }] : []
  if (b === 'todo') return [{ label: 'Segna come completato', icon: Check, onSelect: complete }, ...trashEntry]
  if (b === 'done') return [{ label: 'Riapri', icon: Undo2, onSelect: reopen }, ...trashEntry]
  return [
    { label: 'Ripristina in Da fare', icon: RotateCcw, onSelect: reopen },
    ...(ws.canPurge ? [{ label: 'Elimina definitivamente', icon: X, danger: true, onSelect: deleteForever }] : []),
  ]
})
</script>

<template>
  <div
    class="group relative flex h-11 items-center gap-3 rounded-md pl-4 pr-2 transition-colors"
    :class="[selected ? 'bg-accent-soft/70' : 'hover:bg-surface-2', { 'flash-row': ui.flash.has(item.id) }]"
    role="button"
    tabindex="0"
    @click="ui.selectedItemId = selected ? null : item.id"
    @keydown.enter.self="ui.selectedItemId = item.id"
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
      title="Segna come completato"
      :disabled="readOnly"
      @click.stop="complete"
    >
      <Check :size="12" stroke-width="3" />
    </button>

    <span class="min-w-0 flex-1 truncate text-[13.5px]" :class="{ 'text-ink-3 line-through decoration-line-strong': item.bucket === 'done', 'text-ink-3': item.bucket === 'trash' }" :title="item.title">
      {{ firstLine(item.title) }}
    </span>
    <LabelBadge v-if="!editable || compact" :label-id="item.labelId" />

    <span class="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-2" :title="personLabel">
      <UserAvatar :name="authorName" size="xs" />
      <span v-if="!compact" class="max-w-36 truncate">{{ authorName }}</span>
    </span>

    <span v-if="item.comments.length || openQuestions" class="flex shrink-0 items-center gap-2 text-[11.5px] tabular-nums text-ink-3">
      <span v-if="openQuestions" class="flex items-center gap-0.5 text-p-media" title="Domande aperte"><CircleHelp :size="13" /> {{ openQuestions }}</span>
      <span v-if="item.comments.length" class="flex items-center gap-0.5" title="Commenti"><MessageSquare :size="13" /> {{ item.comments.length }}</span>
    </span>

    <template v-if="editable && !compact">
      <LabelSelect :model-value="item.labelId" @update:model-value="setLabel" @manage="emit('manageLabels')" />
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
      <span v-if="item.dueDate" class="tabular-nums">{{ dayjs(item.dueDate).format('D MMM') }}</span>
      <span>{{ STATUS_LABEL[item.status] }}</span>
      <span>{{ PRIORITY_LABEL[item.priority] }}</span>
      <span v-if="item.bucket !== 'todo'">
        · {{ item.bucket === 'done' ? 'completato' : 'cestinato' }} {{ dayjs(item.completedAt ?? item.trashedAt ?? item.createdAt).fromNow() }}
      </span>
    </span>

    <BaseMenu v-if="menu.length" :items="menu">
      <MenuTriggerButton />
    </BaseMenu>
  </div>
</template>
