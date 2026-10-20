<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AlarmClock, CalendarClock, Check, CircleHelp, Flame, MessageSquareReply, Sun, TriangleAlert, Undo2 } from 'lucide-vue-next'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import LabelBadge from '@/components/board/LabelBadge.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useMyDay } from '@/composables/useMyDay'
import { snoozeOptions, TODAY_SECTIONS, type TodayEntry, type TodaySection } from '@/services/today'
import { firstLine, formatDue } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import type { Item, Project } from '@/types'
import { defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Oggi',
    subtitle: 'Quello che riguarda te in tutti i progetti: i task assegnati a te (o creati da te e non assegnati) e le domande che aspettano te.',
    subtitleLocal: 'Quello che conta oggi in tutti i progetti di questo workspace.',
    section: {
      overdue: 'In ritardo',
      today: 'Scadono oggi',
      toAnswer: 'Aspettano una tua risposta',
      answered: 'Hanno risposto alle tue domande',
      urgent: 'Urgenti',
      week: 'In scadenza questa settimana',
    } as Record<TodaySection, string>,
    empty: 'Niente per oggi: nessun ritardo, nessuna scadenza vicina, nessuna domanda che aspetta te.',
    complete: 'Segna come completato',
    completed: 'Completato',
    snooze: 'Rinvia',
    snoozeHint: 'Lo nascondi da questa vista fino al giorno scelto, solo per te: la scadenza non cambia',
    snoozeTo: { tomorrow: 'A domani', monday: 'A lunedì', week: 'Tra una settimana' },
    snoozed: (n: number) => `${n} ${plural(n, 'rinviato', 'rinviati')}`,
    until: (d: string) => `fino al ${d}`,
    resume: 'Riprendi ora',
    snoozedToast: (d: string) => `Rinviato al ${d}`,
    undo: 'Annulla',
    question: (who: string) => `${who} chiede:`,
    answer: (who: string) => `${who} ha risposto`,
  },
  en: {
    title: 'Today',
    subtitle: 'What concerns you across all projects: tasks assigned to you (or created by you and unassigned) and questions waiting for you.',
    subtitleLocal: 'What matters today across every project in this workspace.',
    section: {
      overdue: 'Overdue',
      today: 'Due today',
      toAnswer: 'Waiting for your answer',
      answered: 'Your questions got answers',
      urgent: 'Urgent',
      week: 'Due this week',
    } as Record<TodaySection, string>,
    empty: 'Nothing for today: nothing overdue, no close due dates, no question waiting for you.',
    complete: 'Mark as completed',
    completed: 'Completed',
    snooze: 'Snooze',
    snoozeHint: 'Hide it from this view until the chosen day, just for you: the due date does not change',
    snoozeTo: { tomorrow: 'Until tomorrow', monday: 'Until Monday', week: 'For a week' },
    snoozed: (n: number) => `${n} snoozed`,
    until: (d: string) => `until ${d}`,
    resume: 'Bring back now',
    snoozedToast: (d: string) => `Snoozed until ${d}`,
    undo: 'Undo',
    question: (who: string) => `${who} asks:`,
    answer: (who: string) => `${who} answered`,
  },
})

/** Vista «Oggi»: la giornata dell'utente, con completamento e rinvio senza aprire il progetto. */
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()
const { day, today, snooze } = useMyDay()

const ICON: Record<TodaySection, typeof Sun> = { overdue: TriangleAlert, today: Sun, toAnswer: CircleHelp, answered: MessageSquareReply, urgent: Flame, week: CalendarClock }
const TONE: Record<TodaySection, string> = { overdue: 'text-danger', today: 'text-p-alta', toAnswer: 'text-p-media', answered: 'text-accent-ink', urgent: 'text-p-immediata', week: 'text-ink-3' }
const total = computed(() => TODAY_SECTIONS.reduce((n, s) => n + day.value.sections[s].length, 0))
const code = (i: Item) => (i.seq ? taskCode(i.seq) : '')

function open(project: Project, item: Item) {
  void router.push({ name: 'project', params: { id: project.id }, query: { item: item.id } })
}
async function complete(e: TodayEntry) {
  await ws.moveItem(e.project.id, e.item.id, 'done')
  ui.toast(m.completed, 'success', { label: m.undo, run: () => void ws.moveItem(e.project.id, e.item.id, 'todo') }, 4000)
}
const snoozeMenu = (e: TodayEntry) =>
  snoozeOptions(today.value).map((o) => ({
    label: `${m.snoozeTo[o.key]} · ${formatDue(o.date)}`,
    icon: AlarmClock,
    onSelect: async () => {
      await snooze(e.item.id, o.date)
      ui.toast(m.snoozedToast(formatDue(o.date)), 'info', { label: m.undo, run: () => void snooze(e.item.id, null) }, 4000)
    },
  }))
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8" data-today>
    <div class="max-w-4xl">
      <h1 class="flex items-center gap-2 text-[26px] font-extrabold tracking-tight"><Sun :size="22" class="text-p-alta" /> {{ m.title }}</h1>
      <p class="mt-1 text-ink-2">{{ ws.isNetwork ? m.subtitle : m.subtitleLocal }}</p>

      <p v-if="!total" class="mt-8 max-w-md rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2" data-today-empty>{{ m.empty }}</p>

      <template v-for="s in TODAY_SECTIONS" :key="s">
        <section v-if="day.sections[s].length" class="mt-7" :data-today-section="s">
          <h2 class="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
            <component :is="ICON[s]" :size="14" :class="TONE[s]" /> {{ m.section[s] }}
            <span class="tabular-nums text-ink-3">{{ day.sections[s].length }}</span>
          </h2>
          <ul class="divide-y divide-line border-y border-line">
            <li v-for="e in day.sections[s]" :key="e.item.id" class="group flex items-center gap-3 py-2" :data-today-item="e.item.id">
              <button
                type="button"
                class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong text-transparent hover:border-ok hover:text-ok"
                :title="m.complete"
                :aria-label="m.complete"
                data-today-complete
                @click="complete(e)"
              >
                <Check :size="11" :stroke-width="3" />
              </button>
              <button type="button" class="min-w-0 flex-1 text-left" @click="open(e.project, e.item)">
                <span class="flex items-center gap-2">
                  <span class="h-4 w-1 shrink-0 rounded-full" :class="`bg-p-${e.item.priority}`" />
                  <span v-if="code(e.item)" class="font-mono text-[11.5px] text-ink-3">{{ code(e.item) }}</span>
                  <span class="truncate text-[13.5px] font-medium group-hover:text-accent-ink">{{ firstLine(e.item.title) }}</span>
                  <LabelBadge :label-id="e.item.labelId" />
                </span>
                <span class="mt-0.5 block truncate pl-3 text-[12px] text-ink-3">
                  {{ e.project.name }}
                  <template v-if="e.question && s === 'toAnswer'"> · {{ m.question(ws.userName(e.question.authorId)) }} {{ e.question.text }}</template>
                  <template v-else-if="e.question && s === 'answered'"> · {{ m.answer(ws.userName(e.question.answers.at(-1)?.authorId)) }}: {{ e.question.answers.at(-1)?.text }}</template>
                  <template v-else-if="ws.isNetwork && e.item.assigneeId && e.item.assigneeId !== ws.currentUser?.id"> · {{ ws.userName(e.item.assigneeId) }}</template>
                </span>
              </button>
              <span v-if="e.item.dueDate" class="shrink-0 text-[12px] tabular-nums" :class="s === 'overdue' ? 'font-semibold text-danger' : 'text-ink-2'">{{ formatDue(e.item.dueDate) }}</span>
              <BaseMenu :items="snoozeMenu(e)">
                <button type="button" class="shrink-0 rounded-md p-1 text-ink-3 opacity-0 hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100" :title="m.snoozeHint" :aria-label="m.snooze" data-today-snooze>
                  <AlarmClock :size="15" />
                </button>
              </BaseMenu>
            </li>
          </ul>
        </section>
      </template>

      <details v-if="day.snoozed.length" class="mt-8" data-today-snoozed>
        <summary class="cursor-pointer text-[13px] font-semibold text-ink-3 hover:text-ink-2">{{ m.snoozed(day.snoozed.length) }}</summary>
        <ul class="mt-2 divide-y divide-line">
          <li v-for="z in day.snoozed" :key="z.item.id" class="flex items-center gap-3 py-2 text-[13px]">
            <button type="button" class="min-w-0 flex-1 truncate text-left hover:text-accent-ink" @click="open(z.project, z.item)">{{ firstLine(z.item.title) }} <span class="text-ink-3">· {{ z.project.name }}</span></button>
            <span class="shrink-0 text-[12px] text-ink-3">{{ m.until(formatDue(z.until)) }}</span>
            <BaseButton size="sm" variant="ghost" @click="snooze(z.item.id, null)"><Undo2 :size="13" /> {{ m.resume }}</BaseButton>
          </li>
        </ul>
      </details>
    </div>
  </div>
</template>
