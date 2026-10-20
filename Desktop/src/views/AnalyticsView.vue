<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { BarChart3 } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import LoadGrid from '@/components/analytics/LoadGrid.vue'
import HealthTrend from '@/components/analytics/HealthTrend.vue'
import PcMatrix from '@/components/analytics/PcMatrix.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { summarize } from '@/services/analytics'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Analisi',
    lead: 'Il quadro del workspace adesso: quanto c’è da fare, in che stato, con quale urgenza e su chi pesa. Si aggiorna da solo con i dati.',
    activeProjects: 'Progetti attivi',
    activeHint: (trashed: number, fav: number) => `${trashed} nel cestino · ${fav} preferiti`,
    todo: 'Da fare',
    withoutDue: (n: number) => `${n} senza scadenza`,
    done: 'Completati',
    doneHint: 'in tutti i progetti',
    inTrash: 'Nel cestino',
    inTrashHint: 'elementi recuperabili',
    overdue: 'Scaduti',
    overdueHint: 'da fare con scadenza passata',
    dueSoon: 'In scadenza',
    dueSoonHint: 'entro 7 giorni',
    openQuestions: 'Domande aperte',
    openQuestionsHint: 'in attesa di risposta',
    byStatus: 'Da fare per stato',
    byPriority: 'Da fare per priorità',
    byUser: 'Carico per utente (elementi assegnati)',
    user: 'Utente',
    urgent: 'Immediati',
    unassigned: 'Non assegnati',
    noItems: 'Nessun elemento ancora. Assegna gli elementi alle persone dal dettaglio o alla creazione.',
    byProject: 'Per progetto',
    project: 'Progetto',
    trash: 'Cestino',
    noProjects: 'Nessun progetto attivo.',
  },
  en: {
    title: 'Analytics',
    lead: 'The workspace at a glance: how much there is to do, in which status, how urgent and who carries the load. It updates by itself as the data changes.',
    activeProjects: 'Active projects',
    activeHint: (trashed: number, fav: number) => `${trashed} in the trash · ${fav} favorites`,
    todo: 'To do',
    withoutDue: (n: number) => `${n} without due date`,
    done: 'Completed',
    doneHint: 'across all projects',
    inTrash: 'In the trash',
    inTrashHint: 'recoverable items',
    overdue: 'Overdue',
    overdueHint: 'to do with a past due date',
    dueSoon: 'Due soon',
    dueSoonHint: 'within 7 days',
    openQuestions: 'Open questions',
    openQuestionsHint: 'waiting for an answer',
    byStatus: 'To do by status',
    byPriority: 'To do by priority',
    byUser: 'Load per user (assigned items)',
    user: 'User',
    urgent: 'Urgent',
    unassigned: 'Unassigned',
    noItems: 'No items yet. Assign items to people from the details or when creating them.',
    byProject: 'By project',
    project: 'Project',
    trash: 'Trash',
    noProjects: 'No active projects.',
  },
})

/**
 * Riepilogo numerico del workspace per gli amministratori: progetti, elementi
 * per contenitore/stato/priorità, scadenze, carico per utente e per progetto.
 */
const ws = useWorkspaceStore()
const today = dayjs().format('YYYY-MM-DD')
const s = computed(() => summarize(Object.values(ws.projects), today))
const favorites = computed(() => ws.favoriteProjects.length)

const tiles = computed(() => [
  { label: m.activeProjects, value: s.value.projects.active, hint: m.activeHint(s.value.projects.trashed, favorites.value) },
  { label: m.todo, value: s.value.items.todo, hint: m.withoutDue(s.value.withoutDue) },
  { label: m.done, value: s.value.items.done, hint: m.doneHint },
  { label: m.inTrash, value: s.value.items.trash, hint: m.inTrashHint },
  { label: m.overdue, value: s.value.overdue, hint: m.overdueHint, tone: s.value.overdue ? 'text-danger' : '' },
  { label: m.dueSoon, value: s.value.dueSoon, hint: m.dueSoonHint, tone: s.value.dueSoon ? 'text-p-alta' : '' },
  { label: m.openQuestions, value: s.value.openQuestions, hint: m.openQuestionsHint },
])
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)
const statusColor = { da_valutare: 'var(--ink-3)', da_definire: 'var(--accent)', confermato: 'var(--accent-ink)' } as const
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8">
    <h1 class="flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><BarChart3 :size="22" class="text-accent" /> {{ m.title }}</h1>
    <p class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
      {{ m.lead }}
    </p>

    <!-- Numeri principali -->
    <div class="mt-6 grid max-w-5xl grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4 lg:grid-cols-7">
      <div v-for="t in tiles" :key="t.label">
        <div class="text-[11.5px] font-semibold text-ink-3">{{ t.label }}</div>
        <div class="text-[30px] font-extrabold leading-none tracking-tight tabular-nums" :class="t.tone">{{ t.value }}</div>
        <div class="mt-1 text-[11.5px] text-ink-3">{{ t.hint }}</div>
      </div>
    </div>

    <HealthTrend class="mt-10" />
    <LoadGrid class="mt-10" />
    <PcMatrix v-if="ws.isNetwork" class="mt-10" />

    <div class="mt-10 grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-2">
      <!-- Per stato -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">{{ m.byStatus }}</h2>
        <ul class="space-y-2">
          <li v-for="st in STATUSES" :key="st" class="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-[13px]">
            <span>{{ STATUS_LABEL[st] }}</span>
            <span class="h-2.5 rounded-full bg-surface-2"><span class="block h-full rounded-full" :style="{ width: pct(s.byStatus[st], s.items.todo) + '%', background: statusColor[st] }" /></span>
            <span class="text-right tabular-nums text-ink-2">{{ s.byStatus[st] }}</span>
          </li>
        </ul>
      </section>

      <!-- Per priorità -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">{{ m.byPriority }}</h2>
        <ul class="space-y-2">
          <li v-for="p in [...PRIORITIES].reverse()" :key="p" class="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-[13px]">
            <span class="flex items-center gap-2"><span class="h-2 w-2 rounded-full" :class="`bg-p-${p}`" />{{ PRIORITY_LABEL[p] }}</span>
            <span class="h-2.5 rounded-full bg-surface-2"><span class="block h-full rounded-full" :class="`bg-p-${p}`" :style="{ width: pct(s.byPriority[p], s.items.todo) + '%' }" /></span>
            <span class="text-right tabular-nums text-ink-2">{{ s.byPriority[p] }}</span>
          </li>
        </ul>
      </section>

      <!-- Per utente -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">{{ m.byUser }}</h2>
        <table v-if="s.byUser.length" class="w-full text-[13px]">
          <thead class="text-[11.5px] text-ink-3">
            <tr><th class="pb-1 text-left font-semibold">{{ m.user }}</th><th class="pb-1 text-right font-semibold">{{ m.todo }}</th><th class="pb-1 text-right font-semibold">{{ m.urgent }}</th><th class="pb-1 text-right font-semibold">{{ m.overdue }}</th><th class="pb-1 text-right font-semibold">{{ m.done }}</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="u in s.byUser" :key="u.userId ?? 'none'">
              <td class="flex items-center gap-2 py-1.5">
                <UserAvatar v-if="u.userId" :name="ws.userName(u.userId)" size="xs" />
                <span :class="{ 'text-ink-3': !u.userId }">{{ u.userId ? ws.userName(u.userId) : m.unassigned }}</span>
              </td>
              <td class="py-1.5 text-right tabular-nums font-semibold">{{ u.todo }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-p-immediata': u.immediata }">{{ u.immediata }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-danger': u.overdue }">{{ u.overdue }}</td>
              <td class="py-1.5 text-right tabular-nums text-ink-2">{{ u.done }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-[13px] text-ink-3">{{ m.noItems }}</p>
      </section>

      <!-- Per progetto -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">{{ m.byProject }}</h2>
        <table v-if="s.byProject.length" class="w-full text-[13px]">
          <thead class="text-[11.5px] text-ink-3">
            <tr><th class="pb-1 text-left font-semibold">{{ m.project }}</th><th class="pb-1 text-right font-semibold">{{ m.todo }}</th><th class="pb-1 text-right font-semibold">{{ m.urgent }}</th><th class="pb-1 text-right font-semibold">{{ m.overdue }}</th><th class="pb-1 text-right font-semibold">{{ m.done }}</th><th class="pb-1 text-right font-semibold">{{ m.trash }}</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="p in s.byProject" :key="p.id">
              <td class="py-1.5"><RouterLink :to="{ name: 'project', params: { id: p.id } }" class="hover:underline">{{ p.name }}</RouterLink></td>
              <td class="py-1.5 text-right tabular-nums font-semibold">{{ p.todo }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-p-immediata': p.immediata }">{{ p.immediata }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-danger': p.overdue }">{{ p.overdue }}</td>
              <td class="py-1.5 text-right tabular-nums text-ink-2">{{ p.done }}</td>
              <td class="py-1.5 text-right tabular-nums text-ink-3">{{ p.trash }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-[13px] text-ink-3">{{ m.noProjects }}</p>
      </section>
    </div>
  </div>
</template>
