<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { CalendarOff, TriangleAlert } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useToday } from '@/composables/useToday'
import { loadGrid, suggestAssignees, type LoadLevel, type LoadTask } from '@/services/load'
import { firstLine, formatDue } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import { DATE, defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Carico per settimana',
    lead: 'Le scadenze di ciascuno nelle prossime settimane, in tutti i progetti. Con le ore settimanali indicate (Membri › Disponibilità) e le stime dei task si confrontano le ore; altrimenti contano le scadenze. Le assenze riducono la disponibilità.',
    person: 'Persona',
    overdue: 'In ritardo',
    unassigned: 'Non assegnati',
    perWeek: (h: number) => `${h} h/sett.`,
    tasks: (n: number) => `${n} ${plural(n, 'scadenza', 'scadenze')}`,
    hours: (h: number, c: number | null) => (c === null ? `${h} h stimate` : `${h} di ${c} h`),
    absent: (d: number) => `assente ${d} g`,
    projects: (n: number) => `${n} progetti diversi`,
    level: { none: '', ok: 'nella norma', high: 'pieno', over: 'troppo' } as Record<LoadLevel, string>,
    cellTitle: (who: string, week: string) => `${who} · settimana del ${week}`,
    inAbsence: 'scade durante un’assenza',
    reassign: 'Passa a…',
    suggested: 'Consigliati',
    others: 'Altri',
    reassigned: (n: string) => `Assegnato a ${n}`,
    empty: 'Nessuna scadenza in questa settimana.',
    close: 'Chiudi',
  },
  en: {
    title: 'Load by week',
    lead: 'Everyone’s due dates in the coming weeks, across all projects. With weekly hours set (Members › Availability) and task estimates, hours are compared; otherwise due dates are counted. Absences reduce availability.',
    person: 'Person',
    overdue: 'Overdue',
    unassigned: 'Unassigned',
    perWeek: (h: number) => `${h} h/week`,
    tasks: (n: number) => `${n} due ${plural(n, 'date', 'dates')}`,
    hours: (h: number, c: number | null) => (c === null ? `${h} h estimated` : `${h} of ${c} h`),
    absent: (d: number) => `away ${d} d`,
    projects: (n: number) => `${n} different projects`,
    level: { none: '', ok: 'normal', high: 'full', over: 'too much' } as Record<LoadLevel, string>,
    cellTitle: (who: string, week: string) => `${who} · week of ${week}`,
    inAbsence: 'due during an absence',
    reassign: 'Hand over to…',
    suggested: 'Suggested',
    others: 'Others',
    reassigned: (n: string) => `Assigned to ${n}`,
    empty: 'No due dates this week.',
    close: 'Close',
  },
})

/** Griglia persone × settimane con scadenze, ore, assenze e collisioni; clic su una cella per i dettagli e la riassegnazione. */
const ws = useWorkspaceStore()
const { today } = useToday()
const grid = computed(() => loadGrid(ws.visibleProjects, ws.users, today.value, 6))
const weeks = computed(() => grid.value[0]?.weeks.map((w) => w.week) ?? [])
const name = (id: string | null) => (id ? ws.userName(id) : m.unassigned)
const userOf = (id: string | null) => (id ? (ws.usersById[id] ?? null) : null)

const TONE: Record<LoadLevel, string> = {
  none: 'text-ink-3',
  ok: 'bg-surface-2 text-ink',
  high: 'bg-p-media/20 text-ink',
  over: 'bg-danger/15 font-semibold text-danger',
}

// Cella aperta: elenco dei task con la riassegnazione
const openCell = ref<{ userId: string | null; week: string | 'overdue' } | null>(null)
const selected = computed(() => {
  const o = openCell.value
  if (!o) return null
  const row = grid.value.find((r) => r.userId === o.userId)
  if (!row) return null
  if (o.week === 'overdue') return { title: `${name(o.userId)} · ${m.overdue}`, tasks: row.overdue, inAbsence: new Set<string>() }
  const c = row.weeks.find((w) => w.week === o.week)
  return c ? { title: m.cellTitle(name(o.userId), dayjs(o.week).format(DATE.dayMonth)), tasks: c.tasks, inAbsence: new Set(c.inAbsence.map((t) => t.item.id)) } : null
})
const toggle = (userId: string | null, week: string | 'overdue') =>
  (openCell.value = openCell.value?.userId === userId && openCell.value.week === week ? null : { userId, week })
const suggestions = (t: LoadTask) => suggestAssignees(t.item, grid.value, ws.users)
const otherUsers = (t: LoadTask) => {
  const s = new Set(suggestions(t))
  return ws.users.filter((u) => u.id !== t.item.assigneeId && !s.has(u.id))
}
async function reassign(t: LoadTask, userId: string) {
  if (!userId) return
  await ws.updateItem(t.project.id, t.item.id, { assigneeId: userId })
}
</script>

<template>
  <section class="max-w-5xl" data-load-grid>
    <h2 class="text-[13px] font-semibold text-ink-2">{{ m.title }}</h2>
    <p class="mb-3 mt-0.5 max-w-3xl text-[12.5px] text-ink-3">{{ m.lead }}</p>
    <div class="overflow-x-auto">
      <table class="w-full border-separate border-spacing-[3px] text-[12.5px]">
        <thead class="text-[11.5px] text-ink-3">
          <tr>
            <th class="pb-1 text-left font-semibold">{{ m.person }}</th>
            <th class="pb-1 font-semibold">{{ m.overdue }}</th>
            <th v-for="w in weeks" :key="w" class="pb-1 font-semibold tabular-nums">{{ dayjs(w).format(DATE.dayMonth) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in grid" :key="r.userId ?? 'none'" :data-load-row="r.userId ?? 'none'">
            <td class="whitespace-nowrap pr-3">
              <span class="flex items-center gap-2">
                <UserAvatar v-if="r.userId" :name="name(r.userId)" size="xs" />
                <span :class="{ 'text-ink-3': !r.userId }">{{ name(r.userId) }}</span>
                <span v-if="userOf(r.userId)?.weeklyHours" class="text-[11px] text-ink-3">{{ m.perWeek(userOf(r.userId)!.weeklyHours) }}</span>
              </span>
            </td>
            <td class="w-[9%] p-0">
              <button
                type="button"
                class="h-11 w-full rounded-md text-center tabular-nums"
                :class="r.overdue.length ? 'bg-danger/15 font-semibold text-danger' : 'text-ink-3'"
                :disabled="!r.overdue.length"
                @click="toggle(r.userId, 'overdue')"
              >
                {{ r.overdue.length || '–' }}
              </button>
            </td>
            <td v-for="c in r.weeks" :key="c.week" class="w-[13%] p-0">
              <button
                type="button"
                class="relative flex h-11 w-full flex-col items-center justify-center rounded-md leading-tight outline-offset-1"
                :class="[TONE[c.level], { 'outline outline-2 outline-accent': openCell?.userId === r.userId && openCell?.week === c.week }, c.absentDays ? 'bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--line)_5px_6px)]' : '']"
                :title="[m.tasks(c.tasks.length), c.hours || c.capacity !== null ? m.hours(c.hours, c.capacity) : '', c.absentDays ? m.absent(c.absentDays) : '', c.projects > 1 ? m.projects(c.projects) : '', m.level[c.level]].filter(Boolean).join(' · ')"
                :data-load-cell="c.week"
                :data-level="c.level"
                @click="toggle(r.userId, c.week)"
              >
                <span class="tabular-nums">{{ c.tasks.length || (c.absentDays ? '' : '–') }}<template v-if="c.hours"> · {{ c.hours }} h</template></span>
                <span v-if="c.absentDays" class="flex items-center gap-0.5 text-[10.5px] font-medium text-ink-3"><CalendarOff :size="10" /> {{ m.absent(c.absentDays) }}</span>
                <TriangleAlert v-if="c.inAbsence.length" :size="11" class="absolute right-1 top-1 text-danger" :aria-label="m.inAbsence" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Dettaglio della cella: task, con la riassegnazione -->
    <div v-if="selected" class="mt-3 rounded-lg border border-line p-3" data-load-detail>
      <p class="mb-2 flex items-center text-[12.5px] font-semibold text-ink-2">
        <span class="flex-1">{{ selected.title }}</span>
        <button type="button" class="text-[12px] font-medium text-ink-3 hover:text-ink" @click="openCell = null">{{ m.close }}</button>
      </p>
      <p v-if="!selected.tasks.length" class="text-[12.5px] text-ink-3">{{ m.empty }}</p>
      <ul class="divide-y divide-line">
        <li v-for="t in selected.tasks" :key="t.item.id" class="flex items-center gap-3 py-1.5 text-[13px]">
          <RouterLink :to="{ name: 'project', params: { id: t.project.id }, query: { item: t.item.id } }" class="min-w-0 flex-1 truncate hover:text-accent-ink">
            <span v-if="t.item.seq" class="font-mono text-[11.5px] text-ink-3">{{ taskCode(t.item.seq) }}</span>
            {{ firstLine(t.item.title) }} <span class="text-ink-3">· {{ t.project.name }}</span>
          </RouterLink>
          <span v-if="selected.inAbsence.has(t.item.id)" class="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-danger" data-in-absence><TriangleAlert :size="11" /> {{ m.inAbsence }}</span>
          <span v-if="t.item.estimateHours" class="shrink-0 text-[12px] tabular-nums text-ink-3">{{ t.item.estimateHours }} h</span>
          <span class="shrink-0 text-[12px] tabular-nums text-ink-2">{{ formatDue(t.item.dueDate!) }}</span>
          <select class="field field-sm w-40 shrink-0" :aria-label="m.reassign" data-load-reassign @change="reassign(t, ($event.target as HTMLSelectElement).value)">
            <option value="">{{ m.reassign }}</option>
            <optgroup v-if="suggestions(t).length" :label="m.suggested">
              <option v-for="id in suggestions(t)" :key="id" :value="id">{{ ws.userName(id) }}</option>
            </optgroup>
            <optgroup :label="m.others">
              <option v-for="u in otherUsers(t)" :key="u.id" :value="u.id">{{ u.displayName }}</option>
            </optgroup>
          </select>
        </li>
      </ul>
    </div>
  </section>
</template>
