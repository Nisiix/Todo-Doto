<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { Lock, Plus, RotateCcw, Star, Trash2, Users, X } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemRow from '@/components/board/ItemRow.vue'
import ItemDialog from '@/components/dialogs/ItemDialog.vue'
import FilterBar from '@/components/board/FilterBar.vue'
import AttachmentsBoard from '@/components/board/AttachmentsBoard.vue'
import DetailPanel from '@/components/layout/DetailPanel.vue'
import LabelsDialog from '@/components/dialogs/LabelsDialog.vue'
import ProjectStack from '@/components/project/ProjectStack.vue'
import ProjectAiTools from '@/components/project/ProjectAiTools.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { BUCKET_LABEL, EMPTY_FILTER, type Bucket, type ItemFilter } from '@/types'
import { applyFilter, countByBucket, isFilterActive, sortForBucket } from '@/services/items'
import { projectSection, type ProjectSection } from '@/services/sections'
import { DATE, defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    deleteMessage: (items: number, atts: number) => `${items} elementi e ${atts} allegati verranno eliminati per tutti. Non si può annullare.`,
    emptyTrashTitle: 'Svuotare il cestino?',
    emptyTrashMessage: (n: number) => `${n} ${plural(n, 'elemento verrà eliminato', 'elementi verranno eliminati')} definitivamente.`,
    emptyTrash: 'Svuota cestino',
    attachments: 'Allegati',
    trashedBanner: (d: string) => `Questo progetto è nel cestino dal ${d}: è in sola lettura.`,
    restore: 'Ripristina',
    unfavorite: 'Togli dai preferiti',
    favorite: 'Aggiungi ai preferiti',
    containers: 'Contenitori',
    newItemKey: 'Nuovo task (N)',
    newItem: 'Nuovo task',
    noMatch: 'Nessun elemento corrisponde ai filtri.',
    emptyTodo: 'Lista vuota. Premi «Nuovo task» (o il tasto N) per aggiungere la prima cosa da fare.',
    emptyDone: 'Ancora nessun elemento completato. Spunta il cerchio accanto a un elemento per portarlo qui.',
    emptyTrashList: 'Il cestino è vuoto. Gli elementi cestinati restano qui finché non li elimini definitivamente.',
  },
  en: {
    deleteMessage: (items: number, atts: number) => `${items} items and ${atts} attachments will be deleted for everyone. This cannot be undone.`,
    emptyTrashTitle: 'Empty the trash?',
    emptyTrashMessage: (n: number) => `${n} ${plural(n, 'item', 'items')} will be permanently deleted.`,
    emptyTrash: 'Empty trash',
    attachments: 'Attachments',
    trashedBanner: (d: string) => `This project has been in the trash since ${d}: it is read-only.`,
    restore: 'Restore',
    unfavorite: 'Remove from favorites',
    favorite: 'Add to favorites',
    containers: 'Lists',
    newItemKey: 'New task (N)',
    newItem: 'New task',
    noMatch: 'No items match the filters.',
    emptyTodo: 'Empty list. Press “New task” (or the N key) to add the first thing to do.',
    emptyDone: 'No completed items yet. Tick the circle next to an item to bring it here.',
    emptyTrashList: 'The trash is empty. Trashed items stay here until you delete them permanently.',
  },
})

const props = defineProps<{ id: string; section?: string }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()

const project = computed(() => ws.projects[props.id] ?? null)
const accessible = computed(() => !!project.value && (ws.visibleProjects.some((p) => p.id === props.id) || ws.trashedProjects.some((p) => p.id === props.id)))
watch(
  accessible,
  (v) => {
    if (!v && ws.status === 'open') router.replace({ name: 'workspace-home' })
  },
  { immediate: true },
)
/** Progetto nel cestino: tutto in sola lettura finché non viene ripristinato. */
const trashed = computed(() => !!project.value?.trashedAt)

/** Sezione aperta dal sottomenu del progetto nella barra laterale: Todo, Stack, Allegati. */
const section = computed<ProjectSection>(() => projectSection(props.section))

const tab = ref<Bucket>('todo')
const filter = ref<ItemFilter>({ ...EMPTY_FILTER })
/** Apertura diretta di un elemento (?item=) da link, notifica o ricerca; ?tab=attachments dei vecchi link porta alla sezione Allegati. */
function applyQuery() {
  const q = route.query.item
  const it = typeof q === 'string' ? project.value?.items.find((i) => i.id === q) : undefined
  if (it) {
    tab.value = it.bucket
    ui.selectedItemId = it.id
  } else if (route.query.tab === 'attachments') router.replace({ name: 'project', params: { id: props.id, section: 'attachments' } })
}
// Cambio di progetto: si riparte da "Da fare" senza selezione né filtri, salvo
// che il link non indichi cosa aprire (la route cambia prima delle props).
watch(
  () => props.id,
  () => {
    tab.value = 'todo'
    ui.selectedItemId = null
    filter.value = { ...EMPTY_FILTER }
    applyQuery()
  },
)
watch(() => [route.query.item, route.query.tab], applyQuery, { immediate: true })

const counts = computed(() => countByBucket(project.value?.items ?? []))
const filterActive = computed(() => isFilterActive(filter.value))

const items = computed(() => {
  if (!project.value) return []
  const bucket = tab.value
  const inBucket = project.value.items.filter((i) => i.bucket === bucket)
  return sortForBucket(applyFilter(inBucket, filter.value), bucket)
})

const selected = computed(() => {
  const id = ui.selectedItemId
  return id ? (project.value?.items.find((i) => i.id === id) ?? null) : null
})

const memberNames = computed(() => project.value?.members.map(ws.userName) ?? [])
const favorite = computed(() => ws.isFavorite(props.id))

// --- azioni progetto ----------------------------------------------------------
// (lo spostamento nel cestino sta accanto al progetto nella barra laterale)

const showLabels = ref(false)
const showNewItem = ref(false)
async function deleteForever() {
  if (!project.value) return
  const ok = await confirm({
    title: common.item.deleteForeverTitle(project.value.name),
    message: m.deleteMessage(project.value.items.length, project.value.attachments.length),
    confirmLabel: common.item.deleteForeverConfirm,
    danger: true,
  })
  if (ok) {
    await ws.deleteProject(project.value.id)
    router.replace({ name: 'workspace-home' })
  }
}
async function emptyTrash() {
  if (!project.value) return
  if (await confirm({ title: m.emptyTrashTitle, message: m.emptyTrashMessage(counts.value.trash), confirmLabel: m.emptyTrash, danger: true }))
    await ws.emptyTrash(project.value.id)
}
// --- scorciatoie ----------------------------------------------------------------
const listEl = ref<HTMLElement | null>(null)
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, select, [contenteditable], [role=dialog]')) return
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !trashed.value && section.value === 'todo') {
    e.preventDefault()
    tab.value = 'todo'
    showNewItem.value = true
  } else if (e.key === 'ArrowDown' && section.value === 'todo' && !t?.closest('[data-item-row]')) {
    // Dalla pagina alla lista: ↓ porta il fuoco sulla prima riga (poi ↑/↓ scorrono)
    const first = listEl.value?.querySelector<HTMLElement>('[data-item-row]')
    if (first) {
      e.preventDefault()
      first.focus()
    }
  }
})

const tabs: { id: Bucket; label: string }[] = [
  { id: 'todo', label: BUCKET_LABEL.todo },
  { id: 'done', label: BUCKET_LABEL.done },
  { id: 'trash', label: BUCKET_LABEL.trash },
]
</script>

<template>
  <template v-if="project">
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Intestazione -->
      <header class="shrink-0 px-8 pt-6">
        <div v-if="trashed" class="mb-3 flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          <Lock :size="14" class="shrink-0" />
          <span class="flex-1">{{ m.trashedBanner(dayjs(project.trashedAt).format(DATE.date)) }}</span>
          <BaseButton size="sm" variant="soft" @click="ws.restoreProject(project.id)"><RotateCcw :size="13" /> {{ m.restore }}</BaseButton>
          <BaseButton v-if="ws.canPurge" size="sm" variant="ghost" class="text-danger" @click="deleteForever"><X :size="13" /> {{ common.item.deleteForever }}</BaseButton>
        </div>
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <!-- Il nome è quello della cartella del progetto: non si modifica qui -->
              <h1 class="truncate text-[24px] font-extrabold leading-tight tracking-tight">{{ project.name }}</h1>
              <button
                v-if="!trashed"
                class="rounded-md p-1 transition-colors"
                :class="favorite ? 'text-p-media' : 'text-ink-3 hover:text-p-media'"
                :title="favorite ? m.unfavorite : m.favorite"
                :aria-pressed="favorite"
                @click="ws.toggleFavorite(project.id)"
              >
                <Star :size="18" :class="{ 'fill-p-media': favorite }" />
              </button>
              <span v-if="project.members.length" class="flex items-center gap-1 text-[12px] text-ink-3" :title="memberNames.join(', ')">
                <Users :size="13" /> {{ project.members.length }}
              </span>
            </div>
            <p v-if="project.description" class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{{ project.description }}</p>
          </div>
        </div>

        <template v-if="section === 'todo'">
          <div class="mt-4">
            <FilterBar v-model="filter" />
          </div>

          <nav class="mt-3 flex items-end gap-1 border-b border-line" :aria-label="m.containers">
            <button
              v-for="t in tabs"
              :key="t.id"
              class="relative -mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[13.5px] font-semibold transition-colors"
              :class="tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'"
              @click="tab = t.id"
            >
              {{ t.label }}
              <span class="text-[12px] font-medium tabular-nums text-ink-3">{{ counts[t.id] || '' }}</span>
            </button>
            <BaseButton v-if="tab === 'todo' && !trashed" size="sm" variant="primary" class="mb-1 ml-auto" :title="m.newItemKey" @click="showNewItem = true">
              <Plus :size="14" /> {{ m.newItem }}
            </BaseButton>
            <BaseButton v-if="tab === 'trash' && counts.trash && !trashed && ws.canPurge" size="sm" variant="ghost" class="mb-1 ml-auto text-danger" @click="emptyTrash">
              <Trash2 :size="13" /> {{ m.emptyTrash }}
            </BaseButton>
          </nav>
        </template>
      </header>

      <!-- Contenuto -->
      <div class="flex-1 overflow-y-auto px-8 pb-10 pt-4">
        <template v-if="section === 'stack'">
          <ProjectStack :project="project" :read-only="trashed" />
          <ProjectAiTools class="mt-12 border-t border-line pt-8" :project="project" :read-only="trashed" />
        </template>
        <template v-else-if="section === 'attachments'">
          <h2 class="mb-4 text-[17px] font-bold tracking-tight">{{ m.attachments }}</h2>
          <AttachmentsBoard :project="project" :read-only="trashed" />
        </template>
        <template v-else>
          <div ref="listEl">
            <TransitionGroup name="fade" tag="div" class="space-y-px">
              <ItemRow v-for="it in items" :key="it.id" :item="it" :project-id="project.id" :read-only="trashed" />
            </TransitionGroup>
          </div>
          <p v-if="!items.length" class="mt-6 max-w-md text-[13.5px] leading-relaxed text-ink-3">
            <template v-if="filterActive">{{ m.noMatch }}</template>
            <template v-else-if="tab === 'todo'">{{ m.emptyTodo }}</template>
            <template v-else-if="tab === 'done'">{{ m.emptyDone }}</template>
            <template v-else>{{ m.emptyTrashList }}</template>
          </p>
        </template>
      </div>
    </div>

    <Transition name="panel" mode="out-in">
      <DetailPanel v-if="selected && section === 'todo'" :key="selected.id" :project="project" :item="selected" :read-only="trashed" @manage-labels="showLabels = true" />
    </Transition>

    <LabelsDialog v-model:open="showLabels" />
    <ItemDialog v-model:open="showNewItem" :project-id="project.id" @manage-labels="showLabels = true" />
  </template>
</template>
