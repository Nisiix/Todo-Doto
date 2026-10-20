<script setup lang="ts">
import { computed, ref } from 'vue'
import { Laptop } from 'lucide-vue-next'
import dayjs from 'dayjs'
import { useWorkspaceStore } from '@/stores/workspace'
import WeeklySummary from '@/components/ai/WeeklySummary.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import PcSetupDialog from '@/components/dialogs/PcSetupDialog.vue'
import { useReadinessStore } from '@/stores/readiness'
import { prereqsOf } from '@/services/readiness'
import { dueState, firstLine, spotlight as spotlightOf } from '@/services/items'
import { DATE, defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    summary: (p: number, todo: number, done: number) => `${p} ${plural(p, 'progetto', 'progetti')} · ${todo} da fare · ${done} ${plural(done, 'completato', 'completati')}`,
    spotlight: 'Da tenere d’occhio',
    nothingUrgent: 'Niente di urgente nei prossimi sette giorni.',
    openQuestions: 'Domande aperte',
    answers: (n: number) => `${n} ${plural(n, 'risposta', 'risposte')}`,
    noQuestions: 'Nessuna domanda in attesa di risposta.',
    pcSetup: 'Configura questo PC',
    pcSetupHint: 'Installa in un colpo i programmi che servono a tutti i tuoi progetti',
    pcMissing: (n: number, p: number) => `A questo PC ${plural(n, 'manca un programma', `mancano ${n} programmi`)} per ${p} ${plural(p, 'progetto', 'progetti')}.`,
    working: 'Chi lavora a cosa',
    you: 'Tu',
    since: (d: string) => `da ${d}`,
    nobodyWorking: 'Nessuno l’ha ancora indicato. Nel dettaglio di un task, «Ci sto lavorando» lo mostra a tutti.',
    empty: 'Questo workspace è vuoto. Crea il primo progetto dal pulsante nella colonna a sinistra: ogni progetto ha la sua lista di cose da fare, i completati e un cestino.',
  },
  en: {
    summary: (p: number, todo: number, done: number) => `${p} ${plural(p, 'project', 'projects')} · ${todo} to do · ${done} completed`,
    spotlight: 'Keep an eye on',
    nothingUrgent: 'Nothing urgent in the next seven days.',
    openQuestions: 'Open questions',
    answers: (n: number) => `${n} ${plural(n, 'answer', 'answers')}`,
    noQuestions: 'No questions waiting for an answer.',
    pcSetup: 'Set up this PC',
    pcSetupHint: 'Install in one go the programs all your projects need',
    pcMissing: (n: number, p: number) => `This PC is missing ${plural(n, 'a program', `${n} programs`)} for ${p} ${plural(p, 'project', 'projects')}.`,
    working: 'Who’s working on what',
    you: 'You',
    since: (d: string) => `for ${d}`,
    nobodyWorking: 'Nobody has said yet. In a task’s details, “I’m working on it” shows it to everyone.',
    empty: 'This workspace is empty. Create the first project with the button in the left column: every project has its own to-do list, completed items and a trash.',
  },
})

const ws = useWorkspaceStore()
const rd = useReadinessStore()
const showPcSetup = ref(false)
/** Cosa manca a questo PC per i progetti visibili (dalle verifiche in background). */
const pcMissing = computed(() => {
  const names = new Set<string>()
  let projects = 0
  for (const p of ws.visibleProjects) {
    const e = prereqsOf(p).length ? rd.mine[p.id] : undefined
    if (!e?.missing.length) continue
    projects++
    for (const x of e.missing) names.add(x.name.toLowerCase())
  }
  return { programs: names.size, projects }
})
const hasPrereqs = computed(() => ws.visibleProjects.some((p) => prereqsOf(p).length))

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
    <div class="flex max-w-5xl items-start gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-[26px] font-extrabold tracking-tight">{{ ws.meta?.name }}</h1>
        <p class="mt-1 text-ink-2">
          {{ m.summary(ws.visibleProjects.length, totals.todo, totals.done) }}
        </p>
      </div>
      <BaseButton v-if="hasPrereqs" size="sm" variant="outline" class="mt-1.5 shrink-0" :title="m.pcSetupHint" data-pc-setup-open @click="showPcSetup = true">
        <Laptop :size="14" /> {{ m.pcSetup }}
      </BaseButton>
    </div>
    <button
      v-if="pcMissing.programs"
      type="button"
      class="mt-4 flex w-full max-w-5xl items-center gap-2 rounded-lg border border-p-alta/40 bg-p-alta/10 px-4 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-p-alta/15"
      data-pc-missing
      @click="showPcSetup = true"
    >
      <Laptop :size="15" class="shrink-0 text-p-alta" />
      <span class="flex-1">{{ m.pcMissing(pcMissing.programs, pcMissing.projects) }}</span>
      <span class="text-accent-ink">{{ m.pcSetup }} →</span>
    </button>

    <!-- Chi lavora a cosa (workspace di rete): una riga per persona, clic per aprire il task -->
    <section v-if="ws.isNetwork" class="mt-8 max-w-5xl" data-working-list>
      <h2 class="mb-2 text-[13px] font-semibold text-ink-2">{{ m.working }}</h2>
      <ul v-if="ws.workingEntries.length" class="grid grid-cols-2 gap-x-10 divide-line">
        <li v-for="e in ws.workingEntries" :key="e.user.id" class="border-b border-line">
          <RouterLink :to="{ name: 'project', params: { id: e.project.id }, query: { item: e.item.id } }" class="flex items-center gap-3 py-2 hover:text-accent-ink">
            <span class="relative">
              <UserAvatar :name="e.user.displayName" size="sm" />
              <span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-ok" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ firstLine(e.item.title) }}</span>
              <span class="block truncate text-[12px] text-ink-3">
                {{ e.user.id === ws.currentUser?.id ? m.you : e.user.displayName }} · {{ e.project.name }} · {{ m.since(dayjs(e.since).fromNow(true)) }}
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-[13.5px] text-ink-3">{{ m.nobodyWorking }}</p>
    </section>

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
    <PcSetupDialog v-model:open="showPcSetup" />

    <p v-if="!ws.visibleProjects.length" class="mt-10 max-w-md rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2">
      {{ m.empty }}
    </p>
  </div>
</template>
