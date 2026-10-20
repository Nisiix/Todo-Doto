<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { Activity, Archive, ClipboardList, Flag, Gavel, HardDrive, ListPlus, Lock, Map as MapIcon, Plus, RotateCcw, Star, Trash2, Users, X } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import VisibilityDot from '@/components/ui/VisibilityDot.vue'
import ItemRow from '@/components/board/ItemRow.vue'
import ItemDialog from '@/components/dialogs/ItemDialog.vue'
import RoadmapDialog from '@/components/dialogs/RoadmapDialog.vue'
import DecisionsDialog from '@/components/dialogs/DecisionsDialog.vue'
import MilestonesDialog from '@/components/dialogs/MilestonesDialog.vue'
import StatusReportDialog from '@/components/dialogs/StatusReportDialog.vue'
import { projectDecisions } from '@/services/decisions'
import StackDriftBanner from '@/components/project/StackDriftBanner.vue'
import ProjectTeams from '@/components/project/ProjectTeams.vue'
import FilterBar from '@/components/board/FilterBar.vue'
import AttachmentsBoard from '@/components/board/AttachmentsBoard.vue'
import DetailPanel from '@/components/layout/DetailPanel.vue'
import LabelsDialog from '@/components/dialogs/LabelsDialog.vue'
import ProjectStack from '@/components/project/ProjectStack.vue'
import GanttChart from '@/components/board/GanttChart.vue'
import ProjectAiTools from '@/components/project/ProjectAiTools.vue'
import CommitSuggestions from '@/components/ai/CommitSuggestions.vue'
import TasksFromTextDialog from '@/components/ai/TasksFromTextDialog.vue'
import QuickAddBar from '@/components/quick/QuickAddBar.vue'
import ProjectInsights from '@/components/project/ProjectInsights.vue'
import { projectSignals } from '@/services/insights'
import { useToday } from '@/composables/useToday'
import { useAiStore } from '@/stores/ai'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useGitStore } from '@/stores/git'
import { useConfirm } from '@/composables/useConfirm'
import { useSharing } from '@/composables/useSharing'
import { BUCKET_LABEL, EMPTY_FILTER, projectVisibility, type Bucket, type ItemFilter, type Visibility } from '@/types'
import { applyFilter, ARCHIVE_DAYS, countByBucket, isArchived, isFilterActive, sortForBucket } from '@/services/items'
import { projectSection, type ProjectSection } from '@/services/sections'
import { DATE, defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    deleteMessage: (items: number, atts: number) => `${items} ${plural(items, 'elemento', 'elementi')} e ${atts} ${plural(atts, 'allegato', 'allegati')} verranno eliminati dal workspace per tutti. Non si può annullare. ${common.projectFiles.untouched}`,
    emptyTrashTitle: 'Svuotare il cestino?',
    emptyTrashMessage: (n: number) => `${n} ${plural(n, 'elemento verrà eliminato', 'elementi verranno eliminati')} definitivamente.`,
    emptyTrash: 'Svuota cestino',
    attachments: 'Allegati',
    trashedBanner: (d: string) => `Questo progetto è nel cestino del workspace dal ${d}: è in sola lettura. ${common.projectFiles.untouchedShort}`,
    visPublic: 'Pubblica',
    visRestricted: 'Limitata',
    visTitle: 'Visibilità del progetto',
    visLocal: 'In locale',
    visPublicItem: 'Pubblica: visibile a tutti',
    visRestrictedItem: 'Limitata: solo utenti scelti',
    visUsers: 'Scegli gli utenti…',
    visNowPublic: 'Progetto pubblico: ora è visibile a tutti i membri del workspace',
    visNowRestricted: (n: number) => (n ? `Progetto limitato: visibile solo agli utenti scelti (${n}) e agli amministratori` : 'Progetto limitato: per ora visibile solo agli amministratori'),
    visChoose: 'Scegli gli utenti',
    restore: 'Ripristina',
    unfavorite: 'Togli dai preferiti',
    favorite: 'Aggiungi ai preferiti',
    containers: 'Contenitori',
    newItemKey: 'Nuovo task (N)',
    newItem: 'Nuovo task',
    fromText: 'Da un testo',
    roadmap: 'Roadmap per il cliente',
    roadmapHint: 'Una pagina con cosa è fatto e cosa arriva, da mandare al cliente o stampare in PDF',
    report: 'Rapporto',
    reportHint: 'Rapporto di stato interno per un periodo: da copiare, salvare in PDF o mandare per email',
    milestones: 'Tappe',
    milestonesHint: 'Versioni e rilasci del progetto: avanzamento e note di versione',
    insights: 'Attenzioni',
    insightsHint: 'Attenzioni e tempi del progetto: ritardi, urgenze senza nessuno, domande senza risposta, task fermi',
    decisions: 'Decisioni',
    decisionsHint: 'Il registro delle decisioni prese nelle domande dei task',
    fromTextHint: 'Ricava i task da appunti, una mail o un verbale',
    noMatch: 'Nessun elemento corrisponde ai filtri.',
    emptyTodo: 'Lista vuota. Premi «Nuovo task» (o il tasto N) per aggiungere la prima cosa da fare.',
    emptyDone: 'Ancora nessun elemento completato. Spunta il cerchio accanto a un elemento per portarlo qui.',
    emptyTrashList: 'Il cestino è vuoto. Gli elementi cestinati restano qui finché non li elimini definitivamente.',
    showArchived: (n: number, d: number) => `Mostra ${plural(n, 'il completato', `i ${n} completati`)} da più di ${d} giorni`,
    hideArchived: 'Nascondi l’archivio',
    archivedHint: 'Restano nel progetto e la ricerca li trova: qui stanno da parte per tenere corta la lista',
  },
  en: {
    deleteMessage: (items: number, atts: number) => `${items} ${plural(items, 'item', 'items')} and ${atts} ${plural(atts, 'attachment', 'attachments')} will be deleted from the workspace for everyone. This cannot be undone. ${common.projectFiles.untouched}`,
    emptyTrashTitle: 'Empty the trash?',
    emptyTrashMessage: (n: number) => `${n} ${plural(n, 'item', 'items')} will be permanently deleted.`,
    emptyTrash: 'Empty trash',
    attachments: 'Attachments',
    trashedBanner: (d: string) => `This project has been in the workspace trash since ${d}: it is read-only. ${common.projectFiles.untouchedShort}`,
    visPublic: 'Public',
    visRestricted: 'Restricted',
    visTitle: 'Project visibility',
    visLocal: 'Local',
    visPublicItem: 'Public: visible to everyone',
    visRestrictedItem: 'Restricted: chosen users only',
    visUsers: 'Choose the users…',
    visNowPublic: 'Public project: it is now visible to every workspace member',
    visNowRestricted: (n: number) => (n ? `Restricted project: visible only to the chosen users (${n}) and administrators` : 'Restricted project: for now visible only to administrators'),
    visChoose: 'Choose the users',
    restore: 'Restore',
    unfavorite: 'Remove from favorites',
    favorite: 'Add to favorites',
    containers: 'Lists',
    newItemKey: 'New task (N)',
    newItem: 'New task',
    fromText: 'From a text',
    roadmap: 'Client roadmap',
    roadmapHint: 'A page with what is done and what is coming, to send to the client or print to PDF',
    report: 'Report',
    reportHint: 'Internal status report for a period: copy it, save it as PDF or send it by email',
    milestones: 'Milestones',
    milestonesHint: 'Project versions and releases: progress and release notes',
    insights: 'Attention',
    insightsHint: 'Project attention and times: overdue, unassigned urgent tasks, unanswered questions, stuck tasks',
    decisions: 'Decisions',
    decisionsHint: 'The log of decisions taken in task questions',
    fromTextHint: 'Pick out tasks from notes, an email or meeting minutes',
    noMatch: 'No items match the filters.',
    emptyTodo: 'Empty list. Press “New task” (or the N key) to add the first thing to do.',
    emptyDone: 'No completed items yet. Tick the circle next to an item to bring it here.',
    emptyTrashList: 'The trash is empty. Trashed items stay here until you delete them permanently.',
    showArchived: (n: number, d: number) => `Show ${plural(n, 'the item', `the ${n} items`)} completed more than ${d} days ago`,
    hideArchived: 'Hide the archive',
    archivedHint: 'They stay in the project and search finds them: they are set aside here to keep the list short',
  },
})

const props = defineProps<{ id: string; section?: string }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()

const project = computed(() => ws.projects[props.id] ?? null)

// Commit git → task: all'apertura del progetto o di una sua sezione, quando cambia la sua cartella e al ritorno sulla finestra
const git = useGitStore()
watch(
  () => [props.id, props.section, project.value?.stack.sourcePath, project.value?.git.autoClose] as const,
  () => {
    if (project.value) void git.scan(project.value, true)
  },
  { immediate: true },
)
useEventListener(window, 'focus', () => {
  if (project.value) void git.scan(project.value)
})
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

const allItems = computed(() => {
  if (!project.value) return []
  const bucket = tab.value
  const inBucket = project.value.items.filter((i) => i.bucket === bucket)
  return sortForBucket(applyFilter(inBucket, filter.value), bucket)
})
// Archivio dei completati: quelli vecchi stanno in fondo, dietro «Mostra archiviati» (un task aperto da un link resta visibile)
const showArchived = ref(false)
watch(() => props.id, () => (showArchived.value = false))
const archived = computed(() => (tab.value === 'done' ? allItems.value.filter((i) => isArchived(i) && i.id !== ui.selectedItemId) : []))
const items = computed(() => {
  if (showArchived.value || !archived.value.length) return allItems.value
  const hidden = new Set(archived.value.map((i) => i.id))
  return allItems.value.filter((i) => !hidden.has(i.id))
})

const selected = computed(() => {
  const id = ui.selectedItemId
  return id ? (project.value?.items.find((i) => i.id === id) ?? null) : null
})

const memberNames = computed(() => project.value?.members.map(ws.userName) ?? [])
/** Visibilità (workspace di rete): pubblica o limitata; l'admin la cambia dall'intestazione. */
const visibility = computed<Visibility>(() => (project.value ? projectVisibility(project.value) : 'public'))
const openPermissions = () => router.push({ name: 'members', query: { permissions: props.id } })
async function setVisibility(v: Visibility) {
  if (!project.value || v === visibility.value) return
  await ws.setProjectVisibility(project.value.id, v)
  if (v === 'public') ui.toast(m.visNowPublic, 'success', undefined, 3000)
  else ui.toast(m.visNowRestricted(project.value.members.length), 'info', { label: m.visChoose, run: openPermissions }, 7000)
}
const visibilityMenu = computed(() => [
  { label: m.visPublicItem, onSelect: () => setVisibility('public') },
  { label: m.visRestrictedItem, onSelect: () => setVisibility('restricted') },
  ...(visibility.value === 'restricted' ? [{ sep: true, label: '' }, { label: m.visUsers, onSelect: openPermissions }] : []),
])
/** Progetto con la cartella Dati o la sua cartella in locale: non si può mostrare agli altri membri. */
const sharing = useSharing()
const shareText = computed(() => (project.value ? sharing.projectText(project.value) : ''))
const favorite = computed(() => ws.isFavorite(props.id))

// --- azioni progetto ----------------------------------------------------------
// (lo spostamento nel cestino sta accanto al progetto nella barra laterale)

const showLabels = ref(false)
const showNewItem = ref(false)
const showFromText = ref(false)
const showRoadmap = ref(false)
const showDecisions = ref(false)
const showMilestones = ref(false)
const showReport = ref(false)
const openMilestones = computed(() => project.value?.milestones.filter((x) => !x.closedAt).length ?? 0)
/** «Mostra i task» di una tappa: lista Da fare filtrata per quella tappa. */
function showMilestoneTasks(id: string) {
  if (section.value !== 'todo') void router.push({ name: 'project', params: { id: props.id } })
  tab.value = 'todo'
  filter.value = { ...EMPTY_FILTER, milestoneId: id }
}
// Attenzioni e tempi di ciclo (pannello sopra la lista «Da fare»)
const showInsights = ref(false)
const { nowIso } = useToday()
const signals = computed(() => (project.value ? projectSignals(project.value, { userIds: ws.users.map((u) => u.id), now: nowIso.value, absences: Object.fromEntries(ws.users.map((u) => [u.id, u.absences])) }) : []))
const highSignals = computed(() => signals.value.filter((x) => x.severity === 'high').length)
const decisionCount = computed(() => (project.value ? projectDecisions(project.value).length : 0))
// IA locale attiva su questo PC: compaiono le funzioni assistite (task da un testo)
const ai = useAiStore()
/** Etichette aperte dal nuovo task: alla chiusura si torna al nuovo task (con i dati già inseriti). */
let backToNewItem = false
function labelsFromNewItem() {
  backToNewItem = true
  showLabels.value = true
}
watch(showLabels, (o) => {
  if (o || !backToNewItem) return
  backToNewItem = false
  showNewItem.value = true
})
// Richieste dalla palette dei comandi (Ctrl+K, «>»): eseguite quando questo progetto è aperto
watch(
  () => ui.projectRequest,
  (r) => {
    if (!r || r.projectId !== props.id || !project.value) return
    ui.projectRequest = null
    if (r.action === 'decisions') showDecisions.value = true
    else if (r.action === 'roadmap') showRoadmap.value = !trashed.value
    else {
      if (section.value !== 'todo') void router.push({ name: 'project', params: { id: props.id } })
      tab.value = 'todo'
      if (r.action === 'insights') showInsights.value = true
      else if (!trashed.value) showNewItem.value = true
    }
  },
  { immediate: true },
)

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
              <!-- Visibilità: verde pubblica, arancione limitata (l'admin la cambia da qui) -->
              <template v-if="ws.isNetwork">
                <button
                  v-if="ws.isAdmin && !trashed && shareText"
                  type="button"
                  class="flex h-6 items-center gap-1.5 rounded-full border border-line px-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
                  :title="shareText"
                  data-share-blocked
                  @click="ui.toast(shareText, 'warning', undefined, 10000)"
                >
                  <HardDrive :size="12" class="text-p-alta" /> {{ m.visLocal }}
                </button>
                <BaseMenu v-else-if="ws.isAdmin && !trashed" :items="visibilityMenu">
                  <button type="button" class="flex h-6 items-center gap-1.5 rounded-full border border-line px-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2" :title="m.visTitle" data-visibility-button>
                    <VisibilityDot :project="project" /> {{ visibility === 'restricted' ? m.visRestricted : m.visPublic }}
                  </button>
                </BaseMenu>
                <span v-else class="flex h-6 items-center gap-1.5 rounded-full border border-line px-2 text-[12px] font-medium text-ink-2" :title="m.visTitle">
                  <VisibilityDot :project="project" /> {{ visibility === 'restricted' ? m.visRestricted : m.visPublic }}
                </span>
              </template>
              <span v-if="visibility === 'restricted' && project.members.length" class="flex items-center gap-1 text-[12px] text-ink-3" :title="memberNames.join(', ')">
                <Users :size="13" /> {{ project.members.length }}
              </span>
            </div>
            <p v-if="project.description" class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{{ project.description }}</p>
          </div>
          <BaseButton size="sm" variant="ghost" class="mt-1 shrink-0" :title="m.milestonesHint" data-milestones-open @click="showMilestones = true">
            <Flag :size="14" /> {{ m.milestones }} <span v-if="openMilestones" class="tabular-nums text-ink-3">{{ openMilestones }}</span>
          </BaseButton>
          <BaseButton v-if="decisionCount" size="sm" variant="ghost" class="mt-1 shrink-0" :title="m.decisionsHint" data-decisions-open @click="showDecisions = true">
            <Gavel :size="14" /> {{ m.decisions }} <span class="tabular-nums text-ink-3">{{ decisionCount }}</span>
          </BaseButton>
          <BaseButton size="sm" variant="ghost" class="mt-1 shrink-0" :title="m.reportHint" data-report-open @click="showReport = true">
            <ClipboardList :size="14" /> {{ m.report }}
          </BaseButton>
          <BaseButton v-if="!trashed" size="sm" variant="ghost" class="mt-1 shrink-0" :title="m.roadmapHint" data-roadmap-open @click="showRoadmap = true">
            <MapIcon :size="14" /> {{ m.roadmap }}
          </BaseButton>
        </div>
        <StackDriftBanner v-if="!trashed" :project="project" />

        <template v-if="section === 'todo'">
          <div class="mt-4">
            <FilterBar v-model="filter" :milestones="project.milestones" />
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
            <BaseButton
              v-if="tab === 'todo' && !trashed"
              size="sm"
              variant="ghost"
              class="mb-1 ml-auto"
              :class="{ 'text-danger': highSignals && !showInsights }"
              :title="m.insightsHint"
              :aria-pressed="showInsights"
              data-insights-toggle
              @click="showInsights = !showInsights"
            >
              <Activity :size="14" /> {{ m.insights }} <span class="tabular-nums">{{ signals.length || '' }}</span>
            </BaseButton>
            <BaseButton v-if="tab === 'todo' && !trashed && ai.active" size="sm" variant="ghost" class="mb-1" :title="m.fromTextHint" data-from-text @click="showFromText = true">
              <ListPlus :size="14" /> {{ m.fromText }}
            </BaseButton>
            <BaseButton v-if="tab === 'todo' && !trashed" size="sm" variant="primary" class="mb-1" :title="m.newItemKey" @click="showNewItem = true">
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
        <GanttChart v-if="section === 'gantt'" :project="project" />
        <template v-else-if="section === 'stack'">
          <ProjectStack :project="project" :read-only="trashed" />
          <ProjectAiTools class="mt-12 border-t border-line pt-8" :project="project" :read-only="trashed" />
          <ProjectTeams v-if="ws.isNetwork" class="mt-12 border-t border-line pt-8" :project="project" :read-only="trashed" />
        </template>
        <template v-else-if="section === 'attachments'">
          <h2 class="mb-4 text-[17px] font-bold tracking-tight">{{ m.attachments }}</h2>
          <AttachmentsBoard :project="project" :read-only="trashed" />
        </template>
        <template v-else>
          <ProjectInsights v-if="tab === 'todo' && showInsights" :project="project" :signals="signals" />
          <QuickAddBar v-if="tab === 'todo' && !trashed" :project-id="project.id" />
          <CommitSuggestions v-if="tab === 'todo' && !trashed" :project="project" />
          <div ref="listEl">
            <TransitionGroup name="fade" tag="div" class="space-y-px">
              <ItemRow v-for="it in items" :key="it.id" :item="it" :project-id="project.id" :read-only="trashed" />
            </TransitionGroup>
          </div>
          <button
            v-if="archived.length"
            type="button"
            class="mt-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink-2"
            :title="m.archivedHint"
            data-archive-toggle
            @click="showArchived = !showArchived"
          >
            <Archive :size="13" /> {{ showArchived ? m.hideArchived : m.showArchived(archived.length, ARCHIVE_DAYS) }}
          </button>
          <p v-if="!items.length && !archived.length" class="mt-6 max-w-md text-[13.5px] leading-relaxed text-ink-3">
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
    <ItemDialog v-model:open="showNewItem" :project-id="project.id" @manage-labels="labelsFromNewItem" />
    <TasksFromTextDialog v-model:open="showFromText" :project-id="project.id" />
    <RoadmapDialog v-model:open="showRoadmap" :project="project" />
    <DecisionsDialog v-model:open="showDecisions" :project="project" />
    <StatusReportDialog v-model:open="showReport" :project="project" />
    <MilestonesDialog v-model:open="showMilestones" :project="project" :read-only="trashed" @show-tasks="showMilestoneTasks" />
  </template>
</template>
