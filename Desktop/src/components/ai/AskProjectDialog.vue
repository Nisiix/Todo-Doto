<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BookOpen, CheckSquare, CircleHelp, FileText, Gavel, Loader2, MessageSquare, NotebookPen, Sparkles } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAiStore } from '@/stores/ai'
import { useAskStore, type AskPhase, type AskResult } from '@/stores/ask'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import { sectionParam } from '@/services/sections'
import type { Passage, PassageKind, ProjectAnswer } from '@/services/askProject'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Chiedi al progetto',
    description: 'Le risposte vengono solo da task, commenti, domande e decisioni, documento di architettura, note dello Stack e allegati di testo o PDF, con l’IA di questo PC: nulla esce dal computer.',
    placeholder: 'Es. «Cosa abbiamo deciso sull’autenticazione?»',
    examples: ['Cosa abbiamo deciso su…', 'Cosa manca per…', 'Chi sta lavorando a…'],
    ask: 'Chiedi',
    files: 'Leggo gli allegati…',
    index: (done: number, total: number) => (total ? `Preparo l’indice del progetto: ${done} di ${total} passaggi…` : 'Cerco nel progetto…'),
    search: 'Cerco nel progetto…',
    answer: 'Scrivo la risposta…',
    nothing: 'Nel progetto non ho trovato nulla su questo. Prova con altre parole o con il codice del task (es. TODO-12).',
    notFound: 'Il progetto non sembra contenere la risposta.',
    failed: 'Non è stato possibile rispondere adesso. Controlla l’IA locale nelle Impostazioni.',
    sources: 'Fonti',
    noAi: 'Per fare domande sul progetto serve l’IA locale di questo PC (gratuita, senza account, i dati restano qui).',
    openAi: 'Impostazioni dell’IA locale',
    source: (n: number) => `Apri la fonte ${n}`,
  },
  en: {
    title: 'Ask the project',
    description: 'Answers come only from tasks, comments, questions and decisions, the architecture document, Stack notes and text or PDF attachments, using this PC’s AI: nothing leaves the computer.',
    placeholder: 'E.g. “What did we decide about authentication?”',
    examples: ['What did we decide about…', 'What is missing for…', 'Who is working on…'],
    ask: 'Ask',
    files: 'Reading the attachments…',
    index: (done: number, total: number) => (total ? `Indexing the project: ${done} of ${total} passages…` : 'Searching the project…'),
    search: 'Searching the project…',
    answer: 'Writing the answer…',
    nothing: 'I found nothing about this in the project. Try other words or the task code (e.g. TODO-12).',
    notFound: 'The project does not seem to contain the answer.',
    failed: 'Could not answer right now. Check the local AI in Settings.',
    sources: 'Sources',
    noAi: 'Asking questions about the project needs this PC’s local AI (free, no account, the data stays here).',
    openAi: 'Local AI settings',
    source: (n: number) => `Open source ${n}`,
  },
})

const ICON: Record<PassageKind, unknown> = {
  task: CheckSquare,
  comments: MessageSquare,
  question: CircleHelp,
  decision: Gavel,
  doc: BookOpen,
  notes: NotebookPen,
  attachment: FileText,
}

/** Domande sul progetto con l'IA locale; la risposta cita le fonti, che si aprono con un clic. */
const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })
const ai = useAiStore()
const askStore = useAskStore()
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()

const question = ref('')
const asked = ref('')
const busy = ref(false)
const phase = ref<AskPhase | null>(null)
const result = ref<AskResult | undefined>(undefined)
watch(open, (o) => {
  if (o && !busy.value) result.value = undefined
})

const phaseText = computed(() => {
  const p = phase.value
  if (!p) return ''
  return p.kind === 'files' ? m.files : p.kind === 'index' ? m.index(p.done, p.total) : p.kind === 'search' ? m.search : m.answer
})
const answer = computed<ProjectAnswer | null>(() => (result.value && 'answer' in result.value ? result.value : null))
/** Testo della risposta con i rimandi [n] come pulsanti. */
const segments = computed(() => (answer.value ? answer.value.answer.split(/(\[\d+\])/).map((t) => ({ t, n: /^\[(\d+)\]$/.exec(t) ? Number(t.slice(1, -1)) : 0 })) : []))
const sources = computed(() => (answer.value ? answer.value.cited.map((n) => ({ n, p: answer.value!.passages[n - 1]! })) : []))

async function submit() {
  const q = question.value.trim()
  if (!q || busy.value) return
  busy.value = true
  asked.value = q
  result.value = undefined
  try {
    result.value = await askStore.ask(props.projectId, q, (p) => (phase.value = p))
  } finally {
    busy.value = false
    phase.value = null
  }
}

function openSource(p: Passage | undefined) {
  if (!p) return
  open.value = false
  if (p.itemId) {
    void router.push({ name: 'project', params: { id: props.projectId }, query: { item: p.itemId } })
    ui.selectedItemId = p.itemId
  } else void router.push({ name: 'project', params: { id: props.projectId, section: sectionParam(p.kind === 'attachment' ? 'attachments' : 'stack') } })
}
const snippet = (p: Passage) => p.text.replace(/\s+/g, ' ').slice(0, 160)
const exists = (p: Passage) => !p.itemId || !!ws.projects[props.projectId]?.items.some((i) => i.id === p.itemId)
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div class="space-y-3 text-[13px]" data-ask>
      <div v-if="!ai.active" class="space-y-2 rounded-md bg-surface-2 px-3 py-2 text-ink-2" data-ask-no-ai>
        <p>{{ m.noAi }}</p>
        <BaseButton size="sm" variant="outline" @click="(open = false), ui.openSettings('ai')"><Sparkles :size="13" /> {{ m.openAi }}</BaseButton>
      </div>
      <template v-else>
        <form class="flex items-start gap-2" @submit.prevent="submit">
          <textarea
            v-model="question"
            rows="2"
            class="field min-h-[2.75rem] flex-1 resize-y"
            :placeholder="m.placeholder"
            maxlength="500"
            data-autofocus
            data-ask-input
            @keydown.enter.exact.prevent="submit"
          />
          <BaseButton type="submit" variant="primary" :disabled="!question.trim() || busy" data-ask-submit>
            <Loader2 v-if="busy" :size="14" class="animate-spin" /><Sparkles v-else :size="14" /> {{ m.ask }}
          </BaseButton>
        </form>
        <div v-if="!asked" class="flex flex-wrap gap-1.5">
          <button v-for="e in m.examples" :key="e" type="button" class="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2 hover:bg-surface-2" @click="question = e.replace('…', ' ')">{{ e }}</button>
        </div>

        <p v-if="busy" class="flex items-center gap-2 text-ink-3" data-ask-phase><Loader2 :size="14" class="animate-spin" /> {{ phaseText }}</p>
        <template v-else-if="result !== undefined">
          <p v-if="result === null" class="text-danger" data-ask-failed>{{ m.failed }}</p>
          <p v-else-if="'nothing' in result" class="rounded-md bg-surface-2 px-3 py-2 text-ink-2" data-ask-nothing>{{ m.nothing }}</p>
          <div v-else-if="answer" class="space-y-3" data-ask-answer>
            <p class="text-[12px] font-semibold text-ink-3">{{ asked }}</p>
            <p v-if="answer.notFound && !answer.cited.length" class="rounded-md bg-surface-2 px-3 py-2 text-ink-2">{{ m.notFound }}</p>
            <p class="whitespace-pre-line leading-relaxed" data-ask-text>
              <template v-for="(s, k) in segments" :key="k">
                <button
                  v-if="s.n && answer.passages[s.n - 1]"
                  type="button"
                  class="mx-0.5 rounded bg-accent-soft px-1 align-super text-[10.5px] font-semibold text-accent-ink hover:underline"
                  :title="m.source(s.n)"
                  :data-ask-cite="s.n"
                  @click="openSource(answer.passages[s.n - 1])"
                >{{ s.n }}</button>
                <template v-else>{{ s.t }}</template>
              </template>
            </p>
            <section v-if="sources.length">
              <h3 class="mb-1 text-[12px] font-semibold text-ink-3">{{ m.sources }}</h3>
              <ul class="divide-y divide-line rounded-md border border-line" data-ask-sources>
                <li v-for="s in sources" :key="s.n">
                  <button type="button" class="flex w-full items-start gap-2 px-3 py-1.5 text-left enabled:hover:bg-surface-2 disabled:cursor-default" :disabled="!exists(s.p)" :data-ask-source="s.p.kind" @click="openSource(s.p)">
                    <span class="mt-0.5 shrink-0 rounded bg-accent-soft px-1 text-[10.5px] font-semibold text-accent-ink">{{ s.n }}</span>
                    <component :is="ICON[s.p.kind]" :size="14" class="mt-0.5 shrink-0 text-ink-3" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{{ s.p.label }}</span>
                      <span class="block truncate text-[12px] text-ink-3">{{ snippet(s.p) }}</span>
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </template>
      </template>
    </div>
  </BaseDialog>
</template>
