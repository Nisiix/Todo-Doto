<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CircleAlert, Info } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useToday } from '@/composables/useToday'
import { AGE_BANDS, cycleStats, type AgeBand, type Severity, type Signal } from '@/services/insights'
import { firstLine } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import { STATUSES, STATUS_LABEL, type Project, type Status } from '@/types'
import { defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    attention: 'Attenzioni',
    attentionHint: 'Cosa sta andando storto senza che nessuno l’abbia segnalato, dal più grave',
    allGood: 'Nessuna attenzione: niente in ritardo, urgenze tutte assegnate, domande con risposta.',
    signal: {
      overdue: (d: number) => `In ritardo di ${d} ${plural(d, 'giorno', 'giorni')}`,
      urgent_unassigned: () => 'Immediata, ma non è assegnata a nessuno',
      unanswered: (d: number) => `Domanda senza risposta da ${d} ${plural(d, 'giorno', 'giorni')}`,
      removed_assignee: () => 'Assegnata a un utente che non è più nel workspace',
      due_in_absence: (d: number) => `Scade tra ${d} ${plural(d, 'giorno', 'giorni')}, mentre chi l’ha è assente`,
      confirmed_no_due: () => 'Confermata senza scadenza: non entra nel Gantt',
      stale: (d: number) => `Ferma da ${d} giorni: nessuna modifica, commento o risposta`,
    },
    severity: { high: 'Grave', medium: 'Da guardare', low: 'Da sistemare' },
    times: 'Tempi',
    timesHint: (n: number) => `Mediane sui ${n} task completati negli ultimi 90 giorni`,
    timesFew: 'Servono almeno 3 task completati negli ultimi 90 giorni per i tempi mediani.',
    toConfirm: 'Da creato a confermato',
    confirmToDone: 'Da confermato a completato',
    leadTime: 'Da creato a completato',
    days: (d: number) => (d < 1 ? 'meno di 1 g' : `${Math.round(d)} g`),
    aging: 'Da quanto aspettano i task da fare',
    openAge: (d: string) => `età mediana ${d}`,
    band: { week: 'meno di 1 settimana', month: '1–4 settimane', quarter: '1–3 mesi', older: 'oltre 3 mesi' } as Record<AgeBand, string>,
    barTitle: (band: string, status: string, n: number) => `${band} · ${status}: ${n}`,
    more: (n: number) => `e altri ${n}…`,
  },
  en: {
    attention: 'Attention',
    attentionHint: 'What is going wrong without anyone flagging it, most serious first',
    allGood: 'Nothing needs attention: nothing overdue, every urgent task assigned, questions answered.',
    signal: {
      overdue: (d: number) => `${d} ${plural(d, 'day', 'days')} overdue`,
      urgent_unassigned: () => 'Immediate, but not assigned to anyone',
      unanswered: (d: number) => `Question unanswered for ${d} ${plural(d, 'day', 'days')}`,
      removed_assignee: () => 'Assigned to a user who is no longer in the workspace',
      due_in_absence: (d: number) => `Due in ${d} ${plural(d, 'day', 'days')}, while its assignee is away`,
      confirmed_no_due: () => 'Confirmed with no due date: it does not enter the Gantt',
      stale: (d: number) => `Stuck for ${d} days: no edits, comments or answers`,
    },
    severity: { high: 'Serious', medium: 'Worth a look', low: 'To tidy up' },
    times: 'Times',
    timesHint: (n: number) => `Medians over the ${n} tasks completed in the last 90 days`,
    timesFew: 'Median times need at least 3 tasks completed in the last 90 days.',
    toConfirm: 'Created to confirmed',
    confirmToDone: 'Confirmed to completed',
    leadTime: 'Created to completed',
    days: (d: number) => (d < 1 ? 'under 1 d' : `${Math.round(d)} d`),
    aging: 'How long open tasks have been waiting',
    openAge: (d: string) => `median age ${d}`,
    band: { week: 'under 1 week', month: '1–4 weeks', quarter: '1–3 months', older: 'over 3 months' } as Record<AgeBand, string>,
    barTitle: (band: string, status: string, n: number) => `${band} · ${status}: ${n}`,
    more: (n: number) => `and ${n} more…`,
  },
})

/** Attenzioni e tempi di ciclo del progetto, calcolati dai dati che ci sono già. */
const props = defineProps<{ project: Project; signals: Signal[] }>()
const ws = useWorkspaceStore()
const ui = useUiStore()

const MAX = 8
const shown = computed(() => props.signals.slice(0, MAX))
const { nowIso } = useToday()
const stats = computed(() => cycleStats(props.project.items, nowIso.value))
const maxBand = computed(() => Math.max(1, ...AGE_BANDS.map((b) => STATUSES.reduce((s, st) => s + stats.value.aging[b.key][st], 0))))
const bandTotal = (b: AgeBand) => STATUSES.reduce((s, st) => s + stats.value.aging[b][st], 0)
const hasOpen = computed(() => AGE_BANDS.some((b) => bandTotal(b.key) > 0))

// Stati come progressione di una sola tinta: da valutare (neutro) → da definire → confermato
const STATUS_FILL: Record<Status, string> = { da_valutare: 'var(--line-strong)', da_definire: 'color-mix(in srgb, var(--accent) 55%, var(--surface))', confermato: 'var(--accent)' }
const SEVERITY_ICON: Record<Severity, typeof AlertTriangle> = { high: AlertTriangle, medium: CircleAlert, low: Info }
const SEVERITY_CLASS: Record<Severity, string> = { high: 'text-danger', medium: 'text-p-alta', low: 'text-ink-3' }

const text = (s: Signal) => m.signal[s.kind](s.days)
const code = (s: Signal) => (s.item.seq ? taskCode(s.item.seq) : '')
</script>

<template>
  <!-- Due colonne solo se il pannello è largo (con il dettaglio del task aperto la lista si stringe) -->
  <section class="@container mb-4 rounded-lg border border-line bg-surface p-4" data-insights>
    <div class="grid gap-x-6 gap-y-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div class="min-w-0">
        <h3 class="mb-2 text-[13px] font-semibold text-ink-2" :title="m.attentionHint">{{ m.attention }} <span class="tabular-nums text-ink-3">{{ signals.length || '' }}</span></h3>
        <p v-if="!signals.length" class="text-[12.5px] text-ink-3">{{ m.allGood }}</p>
        <ul v-else class="space-y-0.5">
          <li v-for="s in shown" :key="s.item.id">
            <button
              type="button"
              class="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
              :data-signal="s.kind"
              @click="ui.selectedItemId = s.item.id"
            >
              <component :is="SEVERITY_ICON[s.severity]" :size="14" class="mt-0.5 shrink-0" :class="SEVERITY_CLASS[s.severity]" :aria-label="m.severity[s.severity]" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium"><span v-if="code(s)" class="font-mono text-[11.5px] text-ink-3">{{ code(s) }}</span> {{ firstLine(s.item.title) }}</span>
                <span class="block text-[12px] text-ink-3">{{ text(s) }}<template v-if="s.item.assigneeId && s.kind !== 'removed_assignee'"> · {{ ws.userName(s.item.assigneeId) }}</template></span>
              </span>
            </button>
          </li>
        </ul>
        <p v-if="signals.length > MAX" class="mt-1 px-1.5 text-[12px] text-ink-3">{{ m.more(signals.length - MAX) }}</p>
      </div>

      <div class="min-w-0">
        <h3 class="mb-2 text-[13px] font-semibold text-ink-2" :title="stats.sample >= 3 ? m.timesHint(stats.sample) : undefined">{{ m.times }}</h3>
        <dl class="divide-y divide-line rounded-md bg-surface-2 px-3" data-cycle-times>
          <div v-for="k in (['toConfirm', 'confirmToDone', 'leadTime'] as const)" :key="k" class="flex items-baseline gap-3 py-1.5">
            <dt class="min-w-0 flex-1 truncate text-[12px] text-ink-2">{{ m[k] }}</dt>
            <dd class="shrink-0 text-[15px] font-bold tabular-nums">{{ stats[k] === null ? '—' : m.days(stats[k]!) }}</dd>
          </div>
        </dl>
        <p v-if="stats.sample < 3" class="mt-1.5 text-[11.5px] text-ink-3">{{ m.timesFew }}</p>

        <template v-if="hasOpen">
          <h4 class="mb-1.5 mt-3 flex items-baseline gap-2 text-[12px] font-medium text-ink-2">
            {{ m.aging }} <span v-if="stats.openAge !== null" class="font-normal text-ink-3">{{ m.openAge(m.days(stats.openAge)) }}</span>
          </h4>
          <ul class="space-y-1" data-aging>
            <li v-for="b in AGE_BANDS" :key="b.key" class="grid grid-cols-[7.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-[11.5px]">
              <span class="truncate text-ink-3">{{ m.band[b.key] }}</span>
              <span class="flex h-2.5 gap-[2px]" :style="{ width: `${(bandTotal(b.key) / maxBand) * 100}%` }">
                <template v-for="st in STATUSES" :key="st">
                  <span
                    v-if="stats.aging[b.key][st]"
                    class="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                    :style="{ flexGrow: stats.aging[b.key][st], background: STATUS_FILL[st] }"
                    :title="m.barTitle(m.band[b.key], STATUS_LABEL[st], stats.aging[b.key][st])"
                  />
                </template>
              </span>
              <span class="text-right tabular-nums text-ink-2">{{ bandTotal(b.key) || '' }}</span>
            </li>
          </ul>
          <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
            <span v-for="st in STATUSES" :key="st" class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-[2px]" :style="{ background: STATUS_FILL[st] }" /> {{ STATUS_LABEL[st] }}</span>
          </p>
        </template>
      </div>
    </div>
  </section>
</template>
