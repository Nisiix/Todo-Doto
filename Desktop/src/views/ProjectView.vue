<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { Lock, Paperclip, Plus, RotateCcw, Settings2, Star, Trash2, Users, X } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemRow from '@/components/board/ItemRow.vue'
import ItemDialog from '@/components/dialogs/ItemDialog.vue'
import FilterBar from '@/components/board/FilterBar.vue'
import AttachmentsBoard from '@/components/board/AttachmentsBoard.vue'
import DetailPanel from '@/components/layout/DetailPanel.vue'
import ProjectDialog from '@/components/dialogs/ProjectDialog.vue'
import LabelsDialog from '@/components/dialogs/LabelsDialog.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { BUCKET_LABEL, EMPTY_FILTER, type Bucket, type ItemFilter } from '@/types'
import { applyFilter, countByBucket, isFilterActive, matchesSearch, sortForBucket } from '@/services/items'

const props = defineProps<{ id: string }>()
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

type Tab = Bucket | 'attachments'
const tab = ref<Tab>('todo')
const filter = ref<ItemFilter>({ ...EMPTY_FILTER })
watch(
  () => props.id,
  () => {
    tab.value = 'todo'
    ui.selectedItemId = null
    filter.value = { ...EMPTY_FILTER }
  },
)

// Apertura diretta di un elemento da link (?item=)
watch(
  () => route.query.item,
  (q) => {
    if (typeof q === 'string' && project.value?.items.some((i) => i.id === q)) {
      const it = project.value.items.find((i) => i.id === q)!
      tab.value = it.bucket
      ui.selectedItemId = q
    }
  },
  { immediate: true },
)

const counts = computed(() => countByBucket(project.value?.items ?? []))
const filterActive = computed(() => isFilterActive(filter.value))

const items = computed(() => {
  if (!project.value || tab.value === 'attachments') return []
  const bucket = tab.value
  const inBucket = project.value.items.filter((i) => i.bucket === bucket && matchesSearch(i, ui.search))
  return sortForBucket(applyFilter(inBucket, filter.value), bucket)
})

const selected = computed(() => {
  const id = ui.selectedItemId
  return id ? (project.value?.items.find((i) => i.id === id) ?? null) : null
})

const memberNames = computed(() => project.value?.members.map(ws.userName) ?? [])
const favorite = computed(() => ws.isFavorite(props.id))

// --- azioni progetto ----------------------------------------------------------
const showEdit = ref(false)
const showLabels = ref(false)
const showNewItem = ref(false)
function trashProject() {
  if (!project.value) return
  const id = project.value.id
  ws.trashProject(id)
  ui.toast('Progetto spostato nel cestino', 'info', { label: 'Annulla', run: () => ws.restoreProject(id) })
}
async function deleteForever() {
  if (!project.value) return
  const ok = await confirm({
    title: `Eliminare definitivamente «${project.value.name}»?`,
    message: `${project.value.items.length} elementi e ${project.value.attachments.length} allegati verranno eliminati per tutti. Non si può annullare.`,
    confirmLabel: 'Elimina per sempre',
    danger: true,
  })
  if (ok) {
    await ws.deleteProject(project.value.id)
    router.replace({ name: 'workspace-home' })
  }
}
async function emptyTrash() {
  if (!project.value) return
  if (await confirm({ title: 'Svuotare il cestino?', message: `${counts.value.trash} elementi verranno eliminati definitivamente.`, confirmLabel: 'Svuota cestino', danger: true }))
    await ws.emptyTrash(project.value.id)
}
// --- scorciatoie ----------------------------------------------------------------
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, select, [contenteditable], [role=dialog]')) return
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !trashed.value) {
    e.preventDefault()
    tab.value = 'todo'
    showNewItem.value = true
  }
})

const tabs: { id: Tab; label: string }[] = [
  { id: 'todo', label: BUCKET_LABEL.todo },
  { id: 'done', label: BUCKET_LABEL.done },
  { id: 'attachments', label: 'Allegati' },
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
          <span class="flex-1">Questo progetto è nel cestino dal {{ dayjs(project.trashedAt).format('D MMM YYYY') }}: è in sola lettura.</span>
          <BaseButton size="sm" variant="soft" @click="ws.restoreProject(project.id)"><RotateCcw :size="13" /> Ripristina</BaseButton>
          <BaseButton v-if="ws.canPurge" size="sm" variant="ghost" class="text-danger" @click="deleteForever"><X :size="13" /> Elimina definitivamente</BaseButton>
        </div>
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span v-if="project.members.length" class="flex items-center gap-1 text-[12px] text-ink-3" :title="memberNames.join(', ')">
                <Users :size="13" /> {{ project.members.length }}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <h1 class="truncate text-[24px] font-extrabold leading-tight tracking-tight">{{ project.name }}</h1>
              <button
                v-if="!trashed"
                class="rounded-md p-1 transition-colors"
                :class="favorite ? 'text-p-media' : 'text-ink-3 hover:text-p-media'"
                :title="favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'"
                :aria-pressed="favorite"
                @click="ws.toggleFavorite(project.id)"
              >
                <Star :size="18" :class="{ 'fill-p-media': favorite }" />
              </button>
            </div>
            <p v-if="project.description" class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{{ project.description }}</p>
          </div>
          <div v-if="!trashed" class="flex shrink-0 items-center gap-1">
            <BaseButton size="icon" variant="ghost" title="Impostazioni progetto" aria-label="Impostazioni progetto" @click="showEdit = true"><Settings2 :size="18" /></BaseButton>
            <BaseButton size="sm" variant="ghost" class="text-danger" :disabled="!ws.isAdmin" title="Sposta il progetto nel cestino" @click="trashProject">
              <Trash2 :size="14" /> Sposta nel cestino
            </BaseButton>
          </div>
        </div>

        <div class="mt-4">
          <FilterBar v-model="filter" />
        </div>

        <nav class="mt-3 flex items-end gap-1 border-b border-line">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="relative -mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[13.5px] font-semibold transition-colors"
            :class="tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'"
            @click="tab = t.id"
          >
            <Paperclip v-if="t.id === 'attachments'" :size="14" />
            {{ t.label }}
            <span class="text-[12px] font-medium tabular-nums text-ink-3">
              {{ t.id === 'attachments' ? project.attachments.length || '' : counts[t.id] || '' }}
            </span>
          </button>
          <BaseButton v-if="tab === 'todo' && !trashed" size="sm" variant="primary" class="mb-1 ml-auto" title="Nuovo elemento (N)" @click="showNewItem = true">
            <Plus :size="14" /> Nuovo elemento
          </BaseButton>
          <BaseButton v-if="tab === 'trash' && counts.trash && !trashed && ws.canPurge" size="sm" variant="ghost" class="mb-1 ml-auto text-danger" @click="emptyTrash">
            <Trash2 :size="13" /> Svuota cestino
          </BaseButton>
        </nav>
      </header>

      <!-- Contenuto -->
      <div class="flex-1 overflow-y-auto px-8 pb-10 pt-4">
        <AttachmentsBoard v-if="tab === 'attachments'" :project="project" :read-only="trashed" />
        <template v-else>
          <TransitionGroup name="fade" tag="div" class="space-y-px">
            <ItemRow v-for="it in items" :key="it.id" :item="it" :project-id="project.id" :read-only="trashed" @manage-labels="showLabels = true" />
          </TransitionGroup>
          <p v-if="!items.length" class="mt-6 max-w-md text-[13.5px] leading-relaxed text-ink-3">
            <template v-if="ui.search || filterActive">Nessun elemento corrisponde alla ricerca o ai filtri.</template>
            <template v-else-if="tab === 'todo'">Lista vuota. Premi «Nuovo elemento» (o il tasto N) per aggiungere la prima cosa da fare.</template>
            <template v-else-if="tab === 'done'">Ancora nessun elemento completato. Spunta il cerchio accanto a un elemento per portarlo qui.</template>
            <template v-else>Il cestino è vuoto. Gli elementi cestinati restano qui finché non li elimini definitivamente.</template>
          </p>
        </template>
      </div>
    </div>

    <Transition name="panel" mode="out-in">
      <DetailPanel v-if="selected" :key="selected.id" :project="project" :item="selected" :read-only="trashed" @manage-labels="showLabels = true" />
    </Transition>

    <ProjectDialog v-model:open="showEdit" :project="project" />
    <LabelsDialog v-model:open="showLabels" />
    <ItemDialog v-model:open="showNewItem" :project-id="project.id" @manage-labels="showLabels = true" />
  </template>
</template>
