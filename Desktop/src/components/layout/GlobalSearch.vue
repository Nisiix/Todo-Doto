<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Activity,
  BarChart3,
  Brush,
  CalendarDays,
  ChevronRight,
  CornerDownLeft,
  Gavel,
  History,
  LayoutDashboard,
  Loader2,
  Map as MapIcon,
  Moon,
  Paperclip,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Users,
  Workflow,
  GitCompareArrows,
} from 'lucide-vue-next'
import { useEventListener, watchDebounced } from '@vueuse/core'
import { useAiStore, withAi } from '@/stores/ai'
import { itemText, nearest, SEARCH_THRESHOLD } from '@/services/aiAssist'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { firstLine, searchAll, type SearchHit } from '@/services/items'
import { matchCommands, parsePaletteQuery, type CommandDef } from '@/services/commands'
import { sectionParam, type ProjectSection } from '@/services/sections'
import { useQuickAdd } from '@/composables/useQuickAdd'
import QuickAddChips from '@/components/quick/QuickAddChips.vue'
import { BUCKET_LABEL, type Attachment, type Item, type Project } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    placeholder: 'Cerca in tutti i progetti',
    results: 'Risultati della ricerca',
    noResults: (q: string) => `Nessun risultato per «${q}».`,
    inTrash: 'nel cestino',
    attachment: 'allegato',
    meaning: 'Per significato',
    placeholderLong: 'Cerca · > comandi · + nuovo task',
    commands: 'Comandi',
    addTo: (p: string) => `Aggiungi a ${p}`,
    addNeedsProject: 'Apri un progetto per aggiungervi un task con +.',
    addEmpty: 'Scrivi il task dopo il +: es. + Esportazione CSV !alta entro venerdì',
    added: 'Task aggiunto',
    noCommands: 'Nessun comando corrisponde.',
    cmd: {
      today: 'Vai a Oggi',
      overview: 'Vai alla Panoramica',
      newItem: (p: string) => `Nuovo task in ${p}`,
      insights: (p: string) => `Attenzioni e tempi di ${p}`,
      decisions: (p: string) => `Decisioni di ${p}`,
      roadmap: (p: string) => `Roadmap per il cliente di ${p}`,
      section: (s: string, p: string) => `Apri ${s} di ${p}`,
      analytics: 'Apri Analisi',
      audit: 'Apri Cronologia',
      members: 'Apri Membri',
      settings: 'Apri Impostazioni',
      calendars: 'Calendari delle scadenze (.ics)',
      cleanup: 'Pulizia guidata',
      automations: 'Automazioni',
      changes: 'Cosa è cambiato tra due date',
      theme: 'Cambia tema (chiaro o scuro)',
    },
    sections: { stack: 'Stack', todo: 'Todo', gantt: 'Gantt', attachments: 'Allegati' } as Record<ProjectSection, string>,
  },
  en: {
    placeholder: 'Search all projects',
    results: 'Search results',
    noResults: (q: string) => `No results for “${q}”.`,
    inTrash: 'in the trash',
    attachment: 'attachment',
    meaning: 'By meaning',
    placeholderLong: 'Search · > commands · + new task',
    commands: 'Commands',
    addTo: (p: string) => `Add to ${p}`,
    addNeedsProject: 'Open a project to add a task to it with +.',
    addEmpty: 'Write the task after the +: e.g. + CSV export !high by friday',
    added: 'Task added',
    noCommands: 'No command matches.',
    cmd: {
      today: 'Go to Today',
      overview: 'Go to the Overview',
      newItem: (p: string) => `New task in ${p}`,
      insights: (p: string) => `Attention and times of ${p}`,
      decisions: (p: string) => `Decisions of ${p}`,
      roadmap: (p: string) => `Client roadmap of ${p}`,
      section: (s: string, p: string) => `Open ${s} of ${p}`,
      analytics: 'Open Analytics',
      audit: 'Open History',
      members: 'Open Members',
      settings: 'Open Settings',
      calendars: 'Due-date calendars (.ics)',
      cleanup: 'Guided cleanup',
      automations: 'Automations',
      changes: 'What changed between two dates',
      theme: 'Switch theme (light or dark)',
    },
    sections: { stack: 'Stack', todo: 'Todo', gantt: 'Gantt', attachments: 'Attachments' } as Record<ProjectSection, string>,
  },
})

/**
 * Ricerca in tutti i progetti visibili (nome del progetto, titolo e
 * descrizione degli elementi). I risultati compaiono sotto il campo,
 * raggruppati per progetto; ↑/↓ e Invio li scorrono e li aprono.
 * Scorciatoie: Ctrl+K oppure / per il fuoco, Esc per chiudere.
 */
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()

// Palette: «> testo» solo comandi, «+ testo» nuovo task nel progetto aperto, altrimenti ricerca
const query = computed(() => parsePaletteQuery(ui.search))
const currentProject = computed(() => (route.name === 'project' ? (ws.projects[String(route.params.id)] ?? null) : null))

const inputEl = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const active = ref(0)

const hits = computed<SearchHit[]>(() => (query.value.mode === 'search' ? searchAll([...ws.visibleProjects, ...ws.trashedProjects], query.value.text) : []))

type Command = CommandDef & { icon: typeof Search; run: () => void }
const commands = computed<Command[]>(() => {
  const p = currentProject.value
  const live = p && !p.trashedAt
  const list: (Command | false | null)[] = [
    { id: 'today', label: m.cmd.today, keywords: ['oggi', 'today', 'giornata', 'agenda'], icon: Sun, run: () => void router.push({ name: 'today' }) },
    { id: 'overview', label: m.cmd.overview, keywords: ['home', 'overview', 'panoramica'], icon: LayoutDashboard, run: () => void router.push({ name: 'workspace-home' }) },
    live && { id: 'newItem', label: m.cmd.newItem(p.name), keywords: ['nuovo', 'crea', 'aggiungi', 'new', 'add', 'task'], icon: Plus, run: () => ui.requestProject('newItem', p.id) },
    live && { id: 'insights', label: m.cmd.insights(p.name), keywords: ['attenzioni', 'ritardi', 'tempi', 'attention', 'overdue', 'times'], icon: Activity, run: () => ui.requestProject('insights', p.id) },
    p && { id: 'decisions', label: m.cmd.decisions(p.name), keywords: ['decisioni', 'registro', 'decisions', 'log'], icon: Gavel, run: () => ui.requestProject('decisions', p.id) },
    live && { id: 'roadmap', label: m.cmd.roadmap(p.name), keywords: ['roadmap', 'cliente', 'client', 'pdf'], icon: MapIcon, run: () => ui.requestProject('roadmap', p.id) },
    ...(p
      ? (['stack', 'todo', 'gantt', 'attachments'] as ProjectSection[]).map((sec) => ({
          id: `section-${sec}`,
          label: m.cmd.section(m.sections[sec], p.name),
          keywords: [sec],
          icon: ChevronRight,
          run: () => void router.push({ name: 'project', params: { id: p.id, section: sectionParam(sec) } }),
        }))
      : []),
    ws.isAdmin && { id: 'analytics', label: m.cmd.analytics, keywords: ['analisi', 'analytics', 'carico', 'statistiche'], icon: BarChart3, run: () => void router.push({ name: 'analytics' }) },
    ws.isAdmin && { id: 'audit', label: m.cmd.audit, keywords: ['cronologia', 'audit', 'history', 'storico'], icon: History, run: () => void router.push({ name: 'audit' }) },
    ws.isAdmin && { id: 'automations', label: m.cmd.automations, keywords: ['automazioni', 'regole', 'promemoria', 'automations', 'rules'], icon: Workflow, run: () => (ui.automationsOpen = true) },
    ws.isAdmin && { id: 'cleanup', label: m.cmd.cleanup, keywords: ['pulizia', 'pulisci', 'ordine', 'cleanup', 'tidy'], icon: Brush, run: () => (ui.cleanupOpen = true) },
    ws.isNetwork && { id: 'members', label: m.cmd.members, keywords: ['membri', 'utenti', 'members', 'users'], icon: Users, run: () => void router.push({ name: 'members' }) },
    { id: 'changes', label: m.cmd.changes, keywords: ['cambiato', 'cambiamenti', 'differenze', 'confronto', 'ferie', 'changes', 'diff', 'compare'], icon: GitCompareArrows, run: () => (ui.changesOpen = true) },
    { id: 'calendars', label: m.cmd.calendars, keywords: ['calendario', 'calendari', 'outlook', 'ics', 'calendar'], icon: CalendarDays, run: () => (ui.calendarsOpen = true) },
    { id: 'settings', label: m.cmd.settings, keywords: ['impostazioni', 'settings', 'preferenze', 'opzioni'], icon: Settings, run: () => ui.openSettings() },
    { id: 'theme', label: m.cmd.theme, keywords: ['tema', 'scuro', 'chiaro', 'dark', 'light', 'theme'], icon: Moon, run: () => ui.toggleTheme() },
  ]
  return list.filter((c): c is Command => !!c)
})
const matchedCommands = computed<Command[]>(() => {
  const q = query.value
  if (q.mode === 'commands') return matchCommands(commands.value, q.text)
  if (q.mode === 'search' && q.text.length >= 2) return matchCommands(commands.value, q.text).slice(0, 4)
  return []
})

// «+ testo»: il task si crea nel progetto aperto, con i comandi dell'inserimento rapido
const addText = computed(() => (query.value.mode === 'add' ? query.value.text : ''))
const { parsed: addParsed, keep: addKeep } = useQuickAdd(addText, () => currentProject.value?.id)
const canAdd = computed(() => query.value.mode === 'add' && !!currentProject.value && !currentProject.value.trashedAt && !!addParsed.value.title)
async function addTask() {
  const p = currentProject.value
  const r = addParsed.value
  if (!p || !canAdd.value) return
  const item = await ws.addItem(p.id, {
    title: r.title,
    ...(r.priority ? { priority: r.priority } : {}),
    assigneeId: r.assigneeId,
    labelId: r.labelId,
    milestoneId: r.milestoneId,
    estimateHours: r.estimateHours,
    ...(r.dueDate ? { status: 'confermato' as const, dueDate: r.dueDate } : {}),
  })
  clear()
  ui.toast(m.added, 'success', { label: common.actions.open, run: () => (ui.selectedItemId = item.id) }, 2500)
}
/**
 * Con l'IA locale attiva: anche i task vicini per significato (es. «login» trova
 * «pagina di accesso»), dopo i risultati per testo e senza ripeterli.
 */
const ai = useAiStore()
const semantic = ref<{ project: Project; item: Item }[]>([])
const semanticBusy = ref(false)
let semanticRun = 0
watchDebounced(
  () => ui.search,
  async (raw) => {
    const run = ++semanticRun
    const parsedQuery = parsePaletteQuery(raw)
    const q = parsedQuery.mode === 'search' ? parsedQuery.text : ''
    if (!ai.active || q.trim().length < 3) {
      semanticBusy.value = false
      semantic.value = []
      return
    }
    semanticBusy.value = true
    const shown = new Set(hits.value.flatMap((h) => h.items.map((i) => i.id)))
    const candidates = ws.visibleProjects
      .flatMap((project) => project.items.filter((item) => item.bucket !== 'trash' && !shown.has(item.id)).map((item) => ({ value: { project, item }, text: itemText(item) })))
      .slice(0, 1500)
    const found = await withAi((cfg) => nearest(cfg, q.trim(), candidates, { mode: 'search', threshold: SEARCH_THRESHOLD, max: 6 }))
    if (run !== semanticRun) return
    semanticBusy.value = false
    semantic.value = (found ?? []).map((f) => f.value)
  },
  { debounce: 450 },
)

/** Lista piatta delle voci selezionabili, nell'ordine in cui sono mostrate. */
type Entry = { key: string; project?: Project; item?: Item; attachment?: Attachment; command?: Command; add?: true }
const entries = computed<Entry[]>(() => [
  ...(canAdd.value ? [{ key: 'add', add: true as const }] : []),
  ...matchedCommands.value.map((command) => ({ key: `cmd:${command.id}`, command })),
  ...hits.value.flatMap((h) => [
    ...(h.nameMatch ? [{ key: h.project.id, project: h.project }] : []),
    ...h.items.map((item) => ({ key: item.id, project: h.project, item })),
    ...h.attachments.map((attachment) => ({ key: attachment.id, project: h.project, attachment })),
  ]),
  ...semantic.value.map(({ project, item }) => ({ key: `s:${item.id}`, project, item })),
])
const show = computed(() => focused.value && ui.search.trim().length > 0)
watch(entries, () => (active.value = 0))

function open(entry: Entry) {
  if (entry.add) return void addTask()
  focused.value = false
  inputEl.value?.blur()
  if (entry.command) {
    ui.search = ''
    // Dopo l'evento della tastiera: una finestra aperta durante l'Invio si richiuderebbe subito
    const run = entry.command.run
    setTimeout(run, 0)
    return
  }
  if (!entry.project) return
  const query = entry.item ? { item: entry.item.id } : {}
  router.push({ name: 'project', params: { id: entry.project.id, section: entry.attachment ? 'attachments' : '' }, query })
  if (entry.item) ui.selectedItemId = entry.item.id
}
function clear() {
  ui.search = ''
  inputEl.value?.blur()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') return clear()
  if (!show.value) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = entries.value.length
    if (n) active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  } else if (e.key === 'Enter') {
    const entry = entries.value[active.value]
    if (entry) open(entry)
  }
}
function focus() {
  inputEl.value?.focus()
  inputEl.value?.select()
}
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    focus()
  } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable], [role=dialog]')) {
    e.preventDefault()
    focus()
  }
})
const entryIndex = (key: string) => entries.value.findIndex((x) => x.key === key)
</script>

<template>
  <div class="relative ml-auto w-80">
    <Search :size="15" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
    <input
      ref="inputEl"
      v-model="ui.search"
      class="field field-sm h-8 pl-8 pr-14"
      :placeholder="m.placeholderLong"
      role="combobox"
      :aria-label="m.placeholder"
      :aria-expanded="show"
      aria-controls="global-search-results"
      @focus="focused = true"
      @blur="focused = false"
      @keydown="onKeydown"
    />
    <span class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 gap-0.5"><span class="kbd">Ctrl</span><span class="kbd">K</span></span>

    <!-- mousedown.prevent: il click non toglie il fuoco al campo prima che scatti -->
    <div
      v-if="show"
      id="global-search-results"
      class="absolute left-0 right-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
      role="listbox"
      :aria-label="m.results"
      @mousedown.prevent
    >
      <!-- + testo: nuovo task nel progetto aperto -->
      <section v-if="query.mode === 'add'" class="py-1" data-palette-add>
        <template v-if="currentProject && !currentProject.trashedAt">
          <button
            v-if="canAdd"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]"
            :class="entryIndex('add') === active ? 'bg-accent-soft' : 'hover:bg-surface-2'"
            role="option"
            :aria-selected="entryIndex('add') === active"
            @click="addTask()"
          >
            <Plus :size="14" class="shrink-0 text-accent-ink" />
            <span class="shrink-0 text-ink-3">{{ m.addTo(currentProject.name) }}:</span>
            <span class="min-w-0 flex-1 truncate font-medium">{{ addParsed.title }}</span>
            <CornerDownLeft :size="13" class="shrink-0 text-ink-3" />
          </button>
          <QuickAddChips class="px-2 pb-1 pt-1" :parsed="addParsed" @remove="addKeep" />
          <p v-if="!canAdd" class="px-3 py-2 text-[12.5px] text-ink-3">{{ m.addEmpty }}</p>
        </template>
        <p v-else class="px-3 py-2 text-[12.5px] text-ink-3">{{ m.addNeedsProject }}</p>
      </section>
      <!-- Comandi -->
      <section v-if="matchedCommands.length" class="py-1" data-palette-commands>
        <p class="px-2 py-1 text-[11.5px] font-semibold text-ink-3">{{ m.commands }}</p>
        <button
          v-for="c in matchedCommands"
          :key="c.id"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px]"
          :class="entryIndex(`cmd:${c.id}`) === active ? 'bg-accent-soft' : 'hover:bg-surface-2'"
          role="option"
          :aria-selected="entryIndex(`cmd:${c.id}`) === active"
          :data-command="c.id"
          @click="open({ key: `cmd:${c.id}`, command: c })"
        >
          <component :is="c.icon" :size="14" class="shrink-0 text-ink-3" />
          <span class="min-w-0 flex-1 truncate">{{ c.label }}</span>
        </button>
      </section>
      <p v-if="query.mode === 'commands' && !matchedCommands.length" class="px-3 py-3 text-[13px] text-ink-3">{{ m.noCommands }}</p>
      <p v-if="query.mode === 'search' && !hits.length && !semantic.length && !semanticBusy && !matchedCommands.length" class="px-3 py-3 text-[13px] text-ink-3">{{ m.noResults(query.text) }}</p>
      <section v-for="h in hits" :key="h.project.id" class="py-1">
        <button
          class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] font-semibold text-ink-2"
          :class="{ 'bg-accent-soft text-accent-ink': h.nameMatch && entryIndex(h.project.id) === active, 'hover:bg-surface-2': h.nameMatch }"
          role="option"
          :aria-selected="h.nameMatch && entryIndex(h.project.id) === active"
          :disabled="!h.nameMatch"
          @click="h.nameMatch && open({ key: h.project.id, project: h.project })"
        >
          <span class="truncate">{{ h.project.name }}</span>
          <span v-if="h.project.trashedAt" class="text-[11px] font-medium text-ink-3">{{ m.inTrash }}</span>
        </button>
        <button
          v-for="it in h.items"
          :key="it.id"
          class="flex w-full items-center gap-2 rounded-md py-1 pl-5 pr-2 text-left text-[13px] hover:bg-surface-2"
          :class="{ 'bg-accent-soft': entryIndex(it.id) === active }"
          role="option"
          :aria-selected="entryIndex(it.id) === active"
          @click="open({ key: it.id, project: h.project, item: it })"
        >
          <span class="h-2 w-2 shrink-0 rounded-full" :class="`bg-p-${it.priority}`" />
          <span class="min-w-0 flex-1 truncate" :class="{ 'text-ink-3 line-through': it.bucket === 'done', 'text-ink-3': it.bucket === 'trash' }">{{ firstLine(it.title) }}</span>
          <span v-if="it.bucket !== 'todo'" class="shrink-0 text-[11px] text-ink-3">{{ BUCKET_LABEL[it.bucket] }}</span>
        </button>
        <button
          v-for="a in h.attachments"
          :key="a.id"
          class="flex w-full items-center gap-2 rounded-md py-1 pl-5 pr-2 text-left text-[13px] hover:bg-surface-2"
          :class="{ 'bg-accent-soft': entryIndex(a.id) === active }"
          role="option"
          :aria-selected="entryIndex(a.id) === active"
          @click="open({ key: a.id, project: h.project, attachment: a })"
        >
          <Paperclip :size="12" class="shrink-0 text-ink-3" />
          <span class="min-w-0 flex-1 truncate">{{ a.name }}</span>
          <span class="shrink-0 text-[11px] text-ink-3">{{ m.attachment }}</span>
        </button>
      </section>
      <!-- Per significato (IA locale) -->
      <section v-if="ai.active && (semantic.length || semanticBusy)" class="border-t border-line py-1" data-semantic-results>
        <p class="flex items-center gap-1.5 px-2 py-1 text-[12px] font-semibold text-ink-2">
          <Loader2 v-if="semanticBusy" :size="12" class="animate-spin" /><Sparkles v-else :size="12" class="text-accent" /> {{ m.meaning }}
        </p>
        <button
          v-for="s in semantic"
          :key="s.item.id"
          class="flex w-full items-center gap-2 rounded-md py-1 pl-5 pr-2 text-left text-[13px] hover:bg-surface-2"
          :class="{ 'bg-accent-soft': entryIndex(`s:${s.item.id}`) === active }"
          role="option"
          :aria-selected="entryIndex(`s:${s.item.id}`) === active"
          @click="open({ key: `s:${s.item.id}`, project: s.project, item: s.item })"
        >
          <span class="h-2 w-2 shrink-0 rounded-full" :class="`bg-p-${s.item.priority}`" />
          <span class="min-w-0 flex-1 truncate" :class="{ 'text-ink-3 line-through': s.item.bucket === 'done' }">{{ firstLine(s.item.title) }}</span>
          <span class="shrink-0 truncate text-[11px] text-ink-3">{{ s.project.name }}</span>
        </button>
      </section>
    </div>
  </div>
</template>
