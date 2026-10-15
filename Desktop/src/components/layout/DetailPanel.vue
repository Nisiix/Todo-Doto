<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Check, Lock, RotateCcw, Trash2, X } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BaseButton from '@/components/ui/BaseButton.vue'
import PrioritySelect from '@/components/board/PrioritySelect.vue'
import StatusSelect from '@/components/board/StatusSelect.vue'
import DueDateField from '@/components/board/DueDateField.vue'
import LabelSelect from '@/components/board/LabelSelect.vue'
import LabelBadge from '@/components/board/LabelBadge.vue'
import ItemComments from '@/components/detail/ItemComments.vue'
import ItemQuestions from '@/components/detail/ItemQuestions.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type Project } from '@/types'

const props = defineProps<{ project: Project; item: Item; readOnly?: boolean }>()
const emit = defineEmits<{ manageLabels: [] }>()
const ws = useWorkspaceStore()
const ui = useUiStore()

/** Elementi completati o cestinati (e progetti nel cestino) sono in sola lettura. */
const locked = computed(() => props.readOnly || props.item.bucket !== 'todo')
const lockReason = computed(() => {
  if (props.readOnly) return 'Progetto nel cestino: ripristinalo per modificare.'
  if (props.item.bucket === 'done') return 'Elemento completato: riaprilo per modificare.'
  if (props.item.bucket === 'trash') return 'Elemento nel cestino: ripristinalo per modificare.'
  return ''
})

// Titolo e note si modificano in locale e si salvano con "Salva": un
// aggiornamento remoto non cancella quello che si sta scrivendo.
const title = ref(props.item.title)
const notes = ref(props.item.notes)
const dirty = computed(() => title.value !== props.item.title || notes.value !== props.item.notes)
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
      title.value = it.title
      notes.value = it.notes
      requestAnimationFrame(autosizeTitle)
    }
  },
)
watch(title, () => requestAnimationFrame(autosizeTitle), { immediate: true })

async function save() {
  const text = title.value.trim()
  if (!text) return
  await ws.updateItem(props.project.id, props.item.id, { title: text, notes: notes.value })
  title.value = text
  ui.toast(t('Salvato'), 'success', undefined, 1800)
}
function discard() {
  title.value = props.item.title
  notes.value = props.item.notes
}

const close = () => (ui.selectedItemId = null)
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('textarea, input, [role=dialog]')) close()
  if (e.key === 's' && (e.ctrlKey || e.metaKey) && dirty.value && !locked.value) {
    e.preventDefault()
    void save()
  }
})

const created = computed(() => `${ws.userName(props.item.createdBy)}, ${dayjs(props.item.createdAt).format('D MMM YYYY')}`)
</script>

<template>
  <aside class="flex h-full w-[420px] shrink-0 flex-col border-l border-line bg-surface">
    <div class="flex items-center gap-1 border-b border-line px-3 py-2">
      <span class="h-5 w-1 rounded-full" :class="`bg-p-${item.priority}`" />
      <span class="ml-1 flex-1 truncate text-[12px] text-ink-3">{{ project.name }}</span>
      <template v-if="!readOnly">
        <template v-if="item.bucket === 'todo'">
          <BaseButton size="sm" variant="ghost" :title="t('Segna come completato')" @click="ws.moveItem(project.id, item.id, 'done')"><Check :size="14" /> {{ t('Completa') }}</BaseButton>
          <BaseButton size="icon-sm" variant="ghost" :title="t('Sposta nel cestino')" @click="ws.moveItem(project.id, item.id, 'trash')"><Trash2 :size="14" /></BaseButton>
        </template>
        <BaseButton v-else size="sm" variant="ghost" @click="ws.moveItem(project.id, item.id, 'todo')">
          <RotateCcw :size="14" /> {{ item.bucket === 'done' ? 'Riapri' : 'Ripristina' }}
        </BaseButton>
      </template>
      <BaseButton size="icon-sm" variant="ghost" :title="t('Chiudi (Esc)')" @click="close"><X :size="15" /></BaseButton>
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
          :aria-label="t('Titolo')"
        />
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <template v-if="!locked">
            <PrioritySelect :model-value="item.priority" @update:model-value="(p) => ws.updateItem(project.id, item.id, { priority: p })" />
            <StatusSelect :model-value="item.status" @update:model-value="(s) => ws.updateItem(project.id, item.id, { status: s })" />
            <DueDateField :model-value="item.dueDate" @update:model-value="(d) => ws.updateItem(project.id, item.id, { dueDate: d })" />
            <LabelSelect :model-value="item.labelId" @update:model-value="(l) => ws.updateItem(project.id, item.id, { labelId: l })" @manage="emit('manageLabels')" />
          </template>
          <template v-else>
          <LabelBadge :label-id="item.labelId" />
          <span class="text-[12.5px] text-ink-2">
            {{ t(PRIORITY_LABEL[item.priority]) }} · {{ t(STATUS_LABEL[item.status]) }}
            <template v-if="item.dueDate"> · scadenza {{ dayjs(item.dueDate).format('D MMM YYYY') }}</template>
          </span>
          </template>
        </div>
        <p class="mt-2 text-[12px] text-ink-3">{{ t('Creato da') }} {{ created }}</p>
      </div>

      <div>
        <h3 class="mb-1.5 text-[13px] font-semibold text-ink-2">{{ t('Descrizione') }}</h3>
        <textarea
          v-model="notes"
          class="field min-h-20 resize-y text-[13.5px] leading-relaxed"
          :placeholder="locked ? '' : 'Dettagli, decisioni, riferimenti…'"
          :disabled="locked"
          :aria-label="t('Descrizione')"
        />
        <div v-if="!locked && dirty" class="mt-2 flex items-center gap-2">
          <BaseButton variant="primary" size="sm" :disabled="!title.trim()" @click="save">{{ t('Salva') }}</BaseButton>
          <BaseButton variant="ghost" size="sm" @click="discard">{{ t('Annulla') }}</BaseButton>
          <span class="text-[11.5px] text-ink-3">{{ t('Ctrl+S') }}</span>
        </div>
      </div>

      <ItemQuestions :item="item" :project-id="project.id" :read-only="locked" />
      <ItemComments :item="item" :project-id="project.id" :read-only="locked" />
    </div>
  </aside>
</template>
