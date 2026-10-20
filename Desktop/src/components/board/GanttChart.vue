<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import { GanttChartSquare } from 'lucide-vue-next'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { firstLine } from '@/services/items'
import { ganttGroups, ganttItems, ganttRange, type GanttBar, type GanttGroupBy } from '@/services/gantt'
import { criticalChain } from '@/services/dependencies'
import { DATE, defineMessages, localeTag, plural } from '@/i18n'
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_RANK, type Project } from '@/types'

const m = defineMessages({
  it: {
    title: 'Gantt',
    lead: 'I task Confermati con una scadenza: la barra va da quando sono stati confermati alla scadenza. Un clic apre il task.',
    groupBy: 'Raggruppa per',
    byLabel: 'Etichetta',
    byPriority: 'Priorità',
    zoom: 'Scala',
    days: 'Giorni',
    weeks: 'Settimane',
    filters: 'Filtri',
    assignee: 'Assegnato a',
    anyone: 'Tutti',
    unassigned: 'Nessuno',
    priority: 'Priorità',
    anyPriority: 'Tutte',
    label: 'Etichetta',
    anyLabel: 'Tutte',
    reset: 'Azzera i filtri',
    noMatch: 'Nessun task corrisponde ai filtri.',
    today: 'Oggi',
    noLabel: 'Senza etichetta',
    task: 'Task',
    empty: 'Nessun task Confermato con una scadenza. Nel dettaglio di un task imposta lo stato «Confermato» e poi la scadenza: comparirà qui.',
    count: (n: number) => `${n} ${plural(n, 'task', 'task')}`,
    tip: (t: string, from: string, to: string, prio: string) => `${t}\n${from} → ${to} · priorità ${prio}`,
    overdue: 'Scaduto',
    links: 'Dipendenze',
    linkConflict: 'il task da finire prima scade dopo',
    critical: 'Catena critica: la sequenza più lunga di task che si aspettano',
    legendLink: 'va fatto prima',
    legendConflict: 'scade dopo il task che lo aspetta',
    legendCritical: 'catena critica',
  },
  en: {
    title: 'Gantt',
    lead: 'Confirmed tasks with a due date: the bar runs from when they were confirmed to the due date. Click opens the task.',
    groupBy: 'Group by',
    byLabel: 'Label',
    byPriority: 'Priority',
    zoom: 'Scale',
    days: 'Days',
    weeks: 'Weeks',
    filters: 'Filters',
    assignee: 'Assigned to',
    anyone: 'Everyone',
    unassigned: 'Nobody',
    priority: 'Priority',
    anyPriority: 'All',
    label: 'Label',
    anyLabel: 'All',
    reset: 'Clear filters',
    noMatch: 'No task matches the filters.',
    today: 'Today',
    noLabel: 'No label',
    task: 'Task',
    empty: 'No Confirmed task with a due date. In a task’s detail set the status to “Confirmed” and then the due date: it will show up here.',
    count: (n: number) => `${n} ${plural(n, 'task', 'tasks')}`,
    tip: (t: string, from: string, to: string, prio: string) => `${t}\n${from} → ${to} · ${prio} priority`,
    overdue: 'Overdue',
    links: 'Dependencies',
    linkConflict: 'the task to finish first is due later',
    critical: 'Critical chain: the longest sequence of tasks waiting for each other',
    legendLink: 'must come first',
    legendConflict: 'due after the task waiting for it',
    legendCritical: 'critical chain',
  },
})

/** Gantt dei task di un progetto (solo Confermati con scadenza), per etichetta o priorità. */
const props = defineProps<{ project: Project }>()
const ws = useWorkspaceStore()
const router = useRouter()

const groupBy = ref<GanttGroupBy>('label')
const zoom = ref<'days' | 'weeks'>('days')
/** Filtri: assegnatario ('' = tutti, '-' = nessuno), priorità, etichetta ('-' = senza etichetta). */
const fAssignee = ref('')
const fPriority = ref('')
const fLabel = ref('')
const filtered = computed(() =>
  props.project.items.filter(
    (i) =>
      (!fAssignee.value || (fAssignee.value === '-' ? !i.assigneeId : i.assigneeId === fAssignee.value)) &&
      (!fPriority.value || i.priority === fPriority.value) &&
      (!fLabel.value || (fLabel.value === '-' ? !i.labelId : i.labelId === fLabel.value)),
  ),
)
const filterActive = computed(() => !!(fAssignee.value || fPriority.value || fLabel.value))
const resetFilters = () => ((fAssignee.value = ''), (fPriority.value = ''), (fLabel.value = ''))
/** Task nel Gantt prima dei filtri (per distinguere "nessun task" da "nessuno corrisponde ai filtri"). */
const unfilteredCount = computed(() => ganttItems(props.project.items).length)
const today = dayjs().startOf('day')

// Solo i task da fare (i completati non entrano nel Gantt)
const groups = computed(() => ganttGroups(filtered.value, groupBy.value, ws.tree.labels, { noLabel: m.noLabel }, { today }))
const total = computed(() => groups.value.reduce((n, g) => n + g.bars.length, 0))
const range = computed(() => ganttRange(groups.value, today))
/** Larghezza di un giorno in pixel. */
const dayW = computed(() => (zoom.value === 'days' ? 30 : 9))
const width = computed(() => range.value.days * dayW.value)
const dayList = computed(() => Array.from({ length: range.value.days }, (_, i) => range.value.from.add(i, 'day')))
/** Mesi dell'intestazione: inizio (in giorni dal primo giorno) e larghezza. */
const months = computed(() => {
  const out: { label: string; left: number; width: number }[] = []
  for (const [i, d] of dayList.value.entries()) {
    const last = out[out.length - 1]
    const raw = d.toDate().toLocaleDateString(localeTag, { month: 'long', year: 'numeric' })
    const label = raw.charAt(0).toUpperCase() + raw.slice(1)
    if (last && last.label === label) last.width += dayW.value
    else out.push({ label, left: i * dayW.value, width: dayW.value })
  }
  return out
})
const offset = (date: string) => dayjs(date).diff(range.value.from, 'day') * dayW.value
const todayLeft = computed(() => today.diff(range.value.from, 'day') * dayW.value + dayW.value / 2)

const barStyle = (b: GanttBar) => ({ left: `${offset(b.start)}px`, width: `${(dayjs(b.end).diff(dayjs(b.start), 'day') + 1) * dayW.value}px` })
const tip = (b: GanttBar) =>
  m.tip(firstLine(b.item.title), dayjs(b.start).format(DATE.date), dayjs(b.end).format(DATE.date), PRIORITY_LABEL[b.item.priority].toLowerCase()) +
  (b.overdue ? ` · ${m.overdue}` : '')
const labelOf = (id: string | null) => (id ? ws.labelsById[id] : null)
/** Un clic su un task lo apre nella lista Todo, con il dettaglio. */
const open = (b: GanttBar) => router.push({ name: 'project', params: { id: props.project.id }, query: { item: b.item.id } })

// --- Dipendenze: frecce dal task da finire prima a quello che lo aspetta ---------
const GROUP_H = 32 // intestazione del gruppo (h-8)
const ROW_H = 36 // riga di un task (h-9)
/** Centro verticale di ogni barra e altezza totale delle righe. */
const rows = computed(() => {
  const y = new Map<string, number>()
  let top = 0
  for (const g of groups.value) {
    top += GROUP_H
    for (const b of g.bars) {
      y.set(b.item.id, top + ROW_H / 2)
      top += ROW_H
    }
  }
  return { y, height: top }
})
const critical = computed(() => new Set(criticalChain(props.project.items).map((i) => i.id)))
const startX = (b: GanttBar) => (b.milestone ? offset(b.end) + dayW.value / 2 - 7 : offset(b.start))
const endX = (b: GanttBar) => (b.milestone ? offset(b.end) + dayW.value / 2 + 7 : offset(b.end) + dayW.value)
const links = computed(() => {
  const bars = new Map(groups.value.flatMap((g) => g.bars.map((b) => [b.item.id, b] as const)))
  const out: { key: string; d: string; conflict: boolean; critical: boolean }[] = []
  for (const b of bars.values()) {
    for (const id of b.item.blockedBy) {
      const a = bars.get(id)
      if (!a) continue
      const x1 = endX(a)
      const y1 = rows.value.y.get(a.item.id)!
      const x2 = startX(b) - 2
      const y2 = rows.value.y.get(b.item.id)!
      const mid = x1 + 8
      // Se il task che aspetta comincia prima della fine del bloccante, la freccia torna indietro a metà tra le righe
      const d = x2 - 8 >= mid ? `M${x1},${y1} H${mid} V${y2} H${x2}` : `M${x1},${y1} H${mid} V${(y1 + y2) / 2} H${x2 - 8} V${y2} H${x2}`
      out.push({ key: `${a.item.id}>${b.item.id}`, d, conflict: a.end > b.end, critical: critical.value.has(a.item.id) && critical.value.has(b.item.id) })
    }
  }
  return out
})

// All'apertura il Gantt si posiziona su oggi
const scroller = ref<HTMLElement | null>(null)
async function scrollToToday() {
  await nextTick()
  if (scroller.value) scroller.value.scrollLeft = Math.max(0, todayLeft.value - scroller.value.clientWidth / 3)
}
onMounted(scrollToToday)
watch(zoom, scrollToToday)
</script>

<template>
  <div class="space-y-4" data-gantt>
    <div>
      <h2 class="flex items-center gap-2 text-[17px] font-bold tracking-tight"><GanttChartSquare :size="18" class="text-accent" /> {{ m.title }}</h2>
      <p class="mt-0.5 text-[13px] text-ink-2">{{ m.lead }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
      <span class="flex items-center gap-2">
        <span class="text-ink-3">{{ m.groupBy }}</span>
        <SegmentedControl v-model="groupBy" :options="[{ value: 'label', label: m.byLabel }, { value: 'priority', label: m.byPriority }]" />
      </span>
      <span class="flex items-center gap-2">
        <span class="text-ink-3">{{ m.zoom }}</span>
        <SegmentedControl v-model="zoom" :options="[{ value: 'days', label: m.days }, { value: 'weeks', label: m.weeks }]" />
      </span>
      <span v-if="links.length" class="flex items-center gap-3 text-[11.5px] text-ink-3" data-gantt-legend>
        <span class="flex items-center gap-1"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--ink-3)" stroke-width="1.5" /></svg> {{ m.legendLink }}</span>
        <span class="flex items-center gap-1"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--accent)" stroke-width="2" /></svg> {{ m.legendCritical }}</span>
        <span class="flex items-center gap-1"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 3" /></svg> {{ m.legendConflict }}</span>
      </span>
      <span class="ml-auto text-[12px] text-ink-3" data-gantt-count>{{ m.count(total) }}</span>
    </div>

    <!-- Filtri: assegnatario, priorità, etichetta -->
    <div class="flex flex-wrap items-end gap-3 text-[13px]" data-gantt-filters>
      <label class="flex flex-col gap-1">
        <span class="text-[12px] text-ink-3">{{ m.assignee }}</span>
        <select v-model="fAssignee" class="field field-sm w-44" data-gantt-filter="assignee">
          <option value="">{{ m.anyone }}</option>
          <option value="-">{{ m.unassigned }}</option>
          <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[12px] text-ink-3">{{ m.priority }}</span>
        <select v-model="fPriority" class="field field-sm w-36" data-gantt-filter="priority">
          <option value="">{{ m.anyPriority }}</option>
          <option v-for="p in [...PRIORITIES].sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])" :key="p" :value="p">{{ PRIORITY_LABEL[p] }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[12px] text-ink-3">{{ m.label }}</span>
        <select v-model="fLabel" class="field field-sm w-44" data-gantt-filter="label">
          <option value="">{{ m.anyLabel }}</option>
          <option value="-">{{ m.noLabel }}</option>
          <option v-for="l in ws.tree.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </label>
      <button v-if="filterActive" type="button" class="mb-1.5 text-[12.5px] font-medium text-accent-ink hover:underline" @click="resetFilters">{{ m.reset }}</button>
    </div>

    <p v-if="!total" class="max-w-xl rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2" data-gantt-empty>{{ unfilteredCount && filterActive ? m.noMatch : m.empty }}</p>

    <div v-else ref="scroller" class="relative max-h-[70vh] overflow-auto rounded-lg border border-line bg-surface">
      <div class="relative" :style="{ width: `${width + 280}px` }">
        <!-- Intestazione: mesi e giorni -->
        <div class="sticky top-0 z-20 flex border-b border-line bg-surface">
          <div class="sticky left-0 z-30 flex w-[280px] shrink-0 items-end border-r border-line bg-surface px-3 pb-1.5 text-[12px] font-semibold text-ink-3">{{ m.task }}</div>
          <div class="relative" :style="{ width: `${width}px`, height: '46px' }">
            <div
              v-for="mo in months"
              :key="mo.label + mo.left"
              class="absolute top-0 h-6 truncate border-l border-line px-1.5 text-[11.5px] font-semibold leading-6 text-ink-2"
              :style="{ left: `${mo.left}px`, width: `${mo.width}px` }"
            >
              {{ mo.label }}
            </div>
            <template v-if="zoom === 'days'">
              <div
                v-for="(d, i) in dayList"
                :key="i"
                class="absolute bottom-0 h-5 border-l border-line text-center text-[10.5px] leading-5 tabular-nums"
                :class="[d.isSame(today, 'day') ? 'font-bold text-danger' : d.day() === 0 || d.day() === 6 ? 'text-ink-3' : 'text-ink-2']"
                :style="{ left: `${i * dayW}px`, width: `${dayW}px` }"
              >
                {{ d.date() }}
              </div>
            </template>
            <template v-else>
              <div
                v-for="(d, i) in dayList"
                v-show="d.day() === 1"
                :key="i"
                class="absolute bottom-0 h-5 border-l border-line pl-1 text-[10.5px] leading-5 tabular-nums text-ink-2"
                :style="{ left: `${i * dayW}px` }"
              >
                {{ d.format('D/M') }}
              </div>
            </template>
          </div>
        </div>

        <!-- Gruppi e barre -->
        <div class="relative">
          <!-- Fine settimana e oggi, su tutta l'altezza -->
          <div class="pointer-events-none absolute inset-y-0" :style="{ left: '280px', width: `${width}px` }">
            <template v-if="zoom === 'days'">
              <div v-for="(d, i) in dayList" v-show="d.day() === 0 || d.day() === 6" :key="i" class="absolute inset-y-0 bg-surface-2/60" :style="{ left: `${i * dayW}px`, width: `${dayW}px` }" />
            </template>
            <div class="absolute inset-y-0 w-px bg-danger/70" :style="{ left: `${todayLeft}px` }" :title="m.today" data-gantt-today />
          </div>

          <!-- Frecce delle dipendenze, sopra le righe e sotto la colonna dei nomi -->
          <svg
            v-if="links.length"
            class="pointer-events-none absolute top-0 z-[5] overflow-visible"
            :style="{ left: '280px', width: `${width}px`, height: `${rows.height}px` }"
            :aria-label="m.links"
            data-gantt-links
          >
            <defs>
              <marker v-for="(c, k) in { n: 'var(--ink-3)', c: 'var(--accent)', x: 'var(--danger)' }" :id="`gantt-arrow-${k}`" :key="k" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" :fill="c" />
              </marker>
            </defs>
            <path
              v-for="l in links"
              :key="l.key"
              :d="l.d"
              fill="none"
              :stroke="l.conflict ? 'var(--danger)' : l.critical ? 'var(--accent)' : 'var(--ink-3)'"
              :stroke-width="l.critical || l.conflict ? 2 : 1.5"
              :stroke-dasharray="l.conflict ? '4 3' : undefined"
              :marker-end="`url(#gantt-arrow-${l.conflict ? 'x' : l.critical ? 'c' : 'n'})`"
              :data-gantt-link="l.key"
              :data-conflict="l.conflict ? '' : undefined"
            >
              <title>{{ l.conflict ? m.linkConflict : l.critical ? m.critical : m.links }}</title>
            </path>
          </svg>
          <section v-for="g in groups" :key="g.key" :data-gantt-group="g.title">
            <div class="sticky left-0 z-10 flex h-8 w-[280px] items-center gap-2 border-b border-line bg-surface-2 px-3 text-[12.5px] font-semibold">
              <span v-if="g.priority" class="h-2.5 w-2.5 shrink-0 rounded-full" :class="`bg-p-${g.priority}`" />
              <span v-else class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: g.color ?? 'transparent', boxShadow: g.color ? 'none' : 'inset 0 0 0 1.5px var(--ink-3)' }" />
              <span class="truncate">{{ g.title }}</span>
              <span class="ml-auto text-[11.5px] font-medium tabular-nums text-ink-3">{{ g.bars.length }}</span>
            </div>
            <div v-for="b in g.bars" :key="b.item.id" class="group flex h-9 border-b border-line/60 hover:bg-surface-2/50" :data-gantt-row="b.item.title">
              <button
                type="button"
                class="sticky left-0 z-10 flex w-[280px] shrink-0 items-center gap-2 border-r border-line bg-surface px-3 text-left text-[13px] group-hover:bg-surface-2"
                :title="b.item.title"
                @click="open(b)"
              >
                <span class="h-2 w-2 shrink-0 rounded-full" :class="`bg-p-${b.item.priority}`" :title="PRIORITY_LABEL[b.item.priority]" />
                <span class="min-w-0 flex-1 truncate" :class="{ 'text-ink-3 line-through': b.item.bucket === 'done' }">{{ firstLine(b.item.title) }}</span>
                <span v-if="groupBy === 'priority' && labelOf(b.item.labelId)" class="h-2 w-2 shrink-0 rounded-full" :style="{ background: labelOf(b.item.labelId)!.color }" :title="labelOf(b.item.labelId)!.name" />
              </button>
              <div class="relative" :style="{ width: `${width}px` }">
                <button
                  type="button"
                  class="absolute top-1/2 h-5 -translate-y-1/2 transition-[filter] hover:brightness-110"
                  :class="[
                    b.milestone ? 'rotate-45 !h-3.5 !w-3.5' : 'rounded-full',
                    `bg-p-${b.item.priority}`,
                    { 'opacity-45': b.item.bucket === 'done', 'ring-2 ring-danger ring-offset-1 ring-offset-surface': b.overdue },
                  ]"
                  :style="b.milestone ? { left: `${offset(b.end) + dayW / 2 - 7}px` } : barStyle(b)"
                  :title="tip(b)"
                  :data-gantt-bar="b.item.title"
                  @click="open(b)"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
