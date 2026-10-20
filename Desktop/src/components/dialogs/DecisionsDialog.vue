<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ClipboardCopy, Gavel, Search } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import RichText from '@/components/detail/RichText.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { decisionsMarkdown, filterDecisions, projectDecisions, type DecisionEntry } from '@/services/decisions'
import { firstLine } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import type { Project } from '@/types'
import { DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Decisioni del progetto',
    description: 'Le risposte segnate come decisione nelle domande dei task, dalla più recente: perché si è fatto così.',
    search: 'Cerca nelle decisioni',
    copy: 'Copia in Markdown',
    copied: 'Decisioni copiate: incollale nel documento di architettura o in una mail',
    none: 'Nessuna decisione registrata. In una domanda di un task, passa sulla risposta scelta e premi «È la decisione».',
    noMatch: 'Nessuna decisione corrisponde alla ricerca.',
    why: 'Perché',
    by: (who: string) => `decisa da ${who}`,
  },
  en: {
    title: 'Project decisions',
    description: 'Answers marked as the decision in task questions, newest first: why things were done this way.',
    search: 'Search the decisions',
    copy: 'Copy as Markdown',
    copied: 'Decisions copied: paste them into the architecture document or an email',
    none: 'No decisions recorded yet. In a task question, hover the chosen answer and press “This is the decision”.',
    noMatch: 'No decision matches the search.',
    why: 'Why',
    by: (who: string) => `decided by ${who}`,
  },
})

/** Registro delle decisioni del progetto: domanda, risposta scelta, motivazione, chi e quando. */
const props = defineProps<{ project: Project }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()
const query = ref('')
watch(open, (o) => {
  if (o) query.value = ''
})

const all = computed(() => projectDecisions(props.project))
const shown = computed(() => filterDecisions(all.value, query.value))
const code = (e: DecisionEntry) => (e.item.seq ? taskCode(e.item.seq) : '')

function openItem(e: DecisionEntry) {
  open.value = false
  void router.push({ name: 'project', params: { id: props.project.id }, query: { item: e.item.id } })
  ui.selectedItemId = e.item.id
}

async function copy() {
  const md = decisionsMarkdown(shown.value, {
    title: `${m.title} · ${props.project.name}`,
    userName: ws.userName,
    formatDate: (iso) => dayjs(iso).format(DATE.date),
    code: (i) => [i.seq ? taskCode(i.seq) : '', firstLine(i.title)].filter(Boolean).join(' '),
    why: m.why,
  })
  await navigator.clipboard.writeText(md)
  ui.toast(m.copied, 'success', undefined, 3000)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div v-if="all.length" class="mb-3 flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-accent">
      <Search :size="14" class="text-ink-3" />
      <input v-model="query" class="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" :placeholder="m.search" :aria-label="m.search" data-autofocus />
    </div>
    <ul class="max-h-[60vh] space-y-3 overflow-y-auto" data-decisions-list>
      <li v-for="e in shown" :key="e.question.id" class="rounded-lg border border-line p-3">
        <button type="button" class="flex w-full items-baseline gap-2 text-left text-[12px] text-ink-3 hover:text-accent-ink" @click="openItem(e)">
          <span class="tabular-nums">{{ dayjs(e.decision.at).format(DATE.date) }}</span>
          <span v-if="code(e)" class="font-mono">{{ code(e) }}</span>
          <span class="truncate font-medium text-ink-2">{{ firstLine(e.item.title) }}</span>
        </button>
        <p class="mt-1.5 text-[13.5px] font-semibold leading-snug"><RichText :text="e.question.text" /></p>
        <p class="mt-1 flex gap-1.5 text-[13.5px] leading-relaxed">
          <Gavel :size="14" class="mt-1 shrink-0 text-accent-ink" />
          <span><RichText :text="e.answer.text" /></span>
        </p>
        <p v-if="e.decision.rationale" class="mt-1 pl-5 text-[12.5px] text-ink-2"><span class="font-medium">{{ m.why }}:</span> {{ e.decision.rationale }}</p>
        <p class="mt-1 pl-5 text-[11.5px] text-ink-3">{{ m.by(ws.userName(e.decision.by)) }}</p>
      </li>
    </ul>
    <p v-if="!all.length" class="text-[13.5px] leading-relaxed text-ink-3">{{ m.none }}</p>
    <p v-else-if="!shown.length" class="text-[13.5px] text-ink-3">{{ m.noMatch }}</p>
    <template v-if="shown.length" #footer>
      <BaseButton variant="ghost" data-decisions-copy @click="copy()"><ClipboardCopy :size="14" /> {{ m.copy }}</BaseButton>
    </template>
  </BaseDialog>
</template>
