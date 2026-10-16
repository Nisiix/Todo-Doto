<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { useWorkspaceStore } from '@/stores/workspace'
import WeeklySummary from '@/components/ai/WeeklySummary.vue'
import { dueState, spotlight as spotlightOf } from '@/services/items'
import { DATE, defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    summary: (p: number, todo: number, done: number) => `${p} ${plural(p, 'progetto', 'progetti')} · ${todo} da fare · ${done} ${plural(done, 'completato', 'completati')}`,
    spotlight: 'Da tenere d’occhio',
    nothingUrgent: 'Niente di urgente nei prossimi sette giorni.',
    openQuestions: 'Domande aperte',
    answers: (n: number) => `${n} ${plural(n, 'risposta', 'risposte')}`,
    noQuestions: 'Nessuna domanda in attesa di risposta.',
    empty: 'Questo workspace è vuoto. Crea il primo progetto dal pulsante nella colonna a sinistra: ogni progetto ha la sua lista di cose da fare, i completati e un cestino.',
  },
  en: {
    summary: (p: number, todo: number, done: number) => `${p} ${plural(p, 'project', 'projects')} · ${todo} to do · ${done} completed`,
    spotlight: 'Keep an eye on',
    nothingUrgent: 'Nothing urgent in the next seven days.',
    openQuestions: 'Open questions',
    answers: (n: number) => `${n} ${plural(n, 'answer', 'answers')}`,
    noQuestions: 'No questions waiting for an answer.',
    empty: 'This workspace is empty. Create the first project with the button in the left column: every project has its own to-do list, completed items and a trash.',
  },
})

const ws = useWorkspaceStore()

/** Elementi urgenti o in scadenza in tutti i progetti visibili. */
const spotlight = computed(() => spotlightOf(ws.visibleProjects).slice(0, 12))
const openQuestions = computed(() =>
  ws.visibleProjects.flatMap((p) =>
    p.items.flatMap((i) => i.questions.filter((q) => !q.resolved).map((q) => ({ project: p, item: i, question: q }))),
  ),
)
const totals = computed(() => {
  const all = ws.visibleProjects.flatMap((p) => p.items)
  return { todo: all.filter((i) => i.bucket === 'todo').length, done: all.filter((i) => i.bucket === 'done').length }
})
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8">
    <h1 class="text-[26px] font-extrabold tracking-tight">{{ ws.meta?.name }}</h1>
    <p class="mt-1 text-ink-2">
      {{ m.summary(ws.visibleProjects.length, totals.todo, totals.done) }}
    </p>

    <div class="mt-8 grid max-w-5xl grid-cols-2 gap-10">
      <section>
        <h2 class="mb-2 text-[13px] font-semibold text-ink-2">{{ m.spotlight }}</h2>
        <ul v-if="spotlight.length" class="divide-y divide-line">
          <li v-for="s in spotlight" :key="s.item.id">
            <RouterLink :to="{ name: 'project', params: { id: s.project.id } }" class="flex items-center gap-3 py-2 hover:text-accent-ink">
              <span class="h-5 w-1 rounded-full" :class="`bg-p-${s.item.priority}`" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ s.item.title }}</span>
                <span class="block truncate text-[12px] text-ink-3">{{ s.project.name }}</span>
              </span>
              <span v-if="s.item.dueDate" class="text-[12px] tabular-nums" :class="dueState(s.item.dueDate) === 'overdue' ? 'font-semibold text-danger' : 'text-ink-2'">
                {{ dayjs(s.item.dueDate).format(DATE.dayMonth) }}
              </span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="text-[13.5px] text-ink-3">{{ m.nothingUrgent }}</p>
      </section>

      <section>
        <h2 class="mb-2 text-[13px] font-semibold text-ink-2">{{ m.openQuestions }}</h2>
        <ul v-if="openQuestions.length" class="divide-y divide-line">
          <li v-for="q in openQuestions" :key="q.question.id">
            <RouterLink
              :to="{ name: 'project', params: { id: q.project.id }, query: { item: q.item.id } }"
              class="block py-2 hover:text-accent-ink"
            >
              <span class="block truncate font-medium">{{ q.question.text }}</span>
              <span class="block truncate text-[12px] text-ink-3">
                {{ ws.userName(q.question.authorId) }} · {{ q.item.title }} · {{ m.answers(q.question.answers.length) }}
              </span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="text-[13.5px] text-ink-3">{{ m.noQuestions }}</p>
      </section>
    </div>

    <WeeklySummary />

    <p v-if="!ws.visibleProjects.length" class="mt-10 max-w-md rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2">
      {{ m.empty }}
    </p>
  </div>
</template>
