<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { CheckCircle2, CircleHelp, CornerDownRight, Gavel, RotateCcw, Trash2, X } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import MentionTextarea from './MentionTextarea.vue'
import RichText from './RichText.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Item } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Domande',
    hideResolved: 'Nascondi risolte',
    resolvedCount: (n: number) => `${n} ${n === 1 ? 'risolta' : 'risolte'}`,
    resolved: 'risolta',
    yourAnswer: 'La tua risposta',
    answer: 'Rispondi',
    markResolved: 'Segna come risolta',
    reopen: 'Riapri',
    delete: 'Elimina domanda',
    none: 'Nessuna domanda.',
    askTag: 'Fai una domanda, @ per taggare chi può rispondere',
    ask: 'Fai una domanda',
    hint: 'Chi fa la domanda può segnarla come risolta quando ha avuto risposta.',
    decide: 'È la decisione',
    decideHint: 'Segna questa risposta come decisione presa: entra nel registro delle decisioni del progetto e la domanda si risolve',
    decision: 'Decisione',
    decided: 'decisa',
    rationale: 'Perché? (facoltativo)',
    rationalePlaceholder: 'Es. è già in uso dal cliente, costa meno da mantenere…',
    confirmDecision: 'Registra la decisione',
    removeDecision: 'Togli la decisione',
    decidedBy: (who: string, when: string) => `Decisa da ${who}, ${when}`,
  },
  en: {
    title: 'Questions',
    hideResolved: 'Hide resolved',
    resolvedCount: (n: number) => `${n} resolved`,
    resolved: 'resolved',
    yourAnswer: 'Your answer',
    answer: 'Answer',
    markResolved: 'Mark as resolved',
    reopen: 'Reopen',
    delete: 'Delete question',
    none: 'No questions.',
    askTag: 'Ask a question, @ to tag who can answer',
    ask: 'Ask a question',
    hint: 'Whoever asks can mark the question as resolved once answered.',
    decide: 'This is the decision',
    decideHint: 'Mark this answer as the decision taken: it goes into the project’s decision log and the question is resolved',
    decision: 'Decision',
    decided: 'decided',
    rationale: 'Why? (optional)',
    rationalePlaceholder: 'E.g. the client already uses it, cheaper to maintain…',
    confirmDecision: 'Record the decision',
    removeDecision: 'Remove the decision',
    decidedBy: (who: string, when: string) => `Decided by ${who}, ${when}`,
  },
})

const props = defineProps<{ item: Item; projectId: string; readOnly?: boolean }>()
const ws = useWorkspaceStore()

const draft = ref('')
const answering = ref<string | null>(null)
const answerDraft = ref('')
const showResolved = ref(false)

const open = computed(() => props.item.questions.filter((q) => !q.resolved))
const resolved = computed(() => props.item.questions.filter((q) => q.resolved && !q.decision))
/** Le domande decise restano sempre in vista: sono la memoria del progetto. */
const visible = computed(() => (showResolved.value ? props.item.questions : props.item.questions.filter((q) => !q.resolved || q.decision)))

async function ask() {
  const t = draft.value.trim()
  if (!t) return
  draft.value = ''
  await ws.askQuestion(props.projectId, props.item.id, t)
}
async function answer(qid: string) {
  const t = answerDraft.value.trim()
  if (!t) return
  answerDraft.value = ''
  answering.value = null
  await ws.answerQuestion(props.projectId, props.item.id, qid, t)
}
const canResolve = (authorId: string) => !props.readOnly && (ws.isAdmin || authorId === ws.currentUser?.id)

// Registro delle decisioni: la risposta scelta, con una motivazione facoltativa
const deciding = ref<{ questionId: string; answerId: string } | null>(null)
const rationale = ref('')
function startDecision(questionId: string, answerId: string) {
  deciding.value = { questionId, answerId }
  rationale.value = ''
}
async function confirmDecision() {
  const d = deciding.value
  if (!d) return
  deciding.value = null
  await ws.decideQuestion(props.projectId, props.item.id, d.questionId, d.answerId, rationale.value)
}
</script>

<template>
  <section>
    <h3 class="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
      {{ m.title }} <span class="tabular-nums text-ink-3">{{ open.length || '' }}</span>
      <button v-if="resolved.length" class="ml-auto text-[12px] font-medium text-accent-ink hover:underline" @click="showResolved = !showResolved">
        {{ showResolved ? m.hideResolved : m.resolvedCount(resolved.length) }}
      </button>
    </h3>

    <ul class="space-y-3">
      <li v-for="q in visible" :key="q.id" class="rounded-lg border p-3" :class="q.decision ? 'border-accent/40' : q.resolved ? 'border-line opacity-70' : 'border-p-media/50 bg-p-media/5'">
        <div class="flex items-start gap-2.5">
          <component :is="q.decision ? Gavel : q.resolved ? CheckCircle2 : CircleHelp" :size="16" class="mt-0.5 shrink-0" :class="q.decision ? 'text-accent-ink' : q.resolved ? 'text-ok' : 'text-p-media'" />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2 text-[12px]">
              <span class="font-semibold text-ink">{{ ws.userName(q.authorId) }}</span>
              <span class="text-ink-3">{{ dayjs(q.createdAt).fromNow() }}</span>
              <span v-if="q.decision" class="font-medium text-accent-ink">{{ m.decided }}</span>
              <span v-else-if="q.resolved" class="text-ok">{{ m.resolved }}</span>
            </div>
            <p class="text-[13.5px] leading-relaxed"><RichText :text="q.text" /></p>

            <ul v-if="q.answers.length" class="mt-2 space-y-2 border-l-2 border-line pl-3">
              <li
                v-for="a in q.answers"
                :key="a.id"
                class="group/answer flex gap-2"
                :class="{ '-ml-1 rounded-md bg-accent/10 p-1.5 pl-2 ring-1 ring-accent/30': q.decision?.answerId === a.id }"
                :data-decision="q.decision?.answerId === a.id ? '' : undefined"
              >
                <UserAvatar :name="ws.userName(a.authorId)" size="xs" class="mt-0.5" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 text-[12px]">
                    <span class="font-semibold">{{ ws.userName(a.authorId) }}</span>
                    <span class="text-ink-3">{{ dayjs(a.createdAt).fromNow() }}</span>
                    <span v-if="q.decision?.answerId === a.id" class="inline-flex items-center gap-1 font-semibold text-accent-ink"><Gavel :size="11" /> {{ m.decision }}</span>
                    <button
                      v-else-if="canResolve(q.authorId) && !deciding"
                      type="button"
                      class="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-3 opacity-0 transition-opacity hover:text-accent-ink focus-visible:opacity-100 group-hover/answer:opacity-100"
                      :title="m.decideHint"
                      data-decide
                      @click="startDecision(q.id, a.id)"
                    >
                      <Gavel :size="11" /> {{ m.decide }}
                    </button>
                  </div>
                  <p class="text-[13px] leading-relaxed"><RichText :text="a.text" /></p>
                  <template v-if="q.decision?.answerId === a.id">
                    <p v-if="q.decision.rationale" class="mt-1 text-[12.5px] leading-relaxed text-ink-2">{{ q.decision.rationale }}</p>
                    <p class="mt-1 flex items-center gap-2 text-[11.5px] text-ink-3">
                      {{ m.decidedBy(ws.userName(q.decision.by), dayjs(q.decision.at).fromNow()) }}
                      <button v-if="canResolve(q.authorId)" type="button" class="inline-flex items-center gap-0.5 hover:text-danger" @click="ws.decideQuestion(projectId, item.id, q.id, null)">
                        <X :size="11" /> {{ m.removeDecision }}
                      </button>
                    </p>
                  </template>
                  <form v-if="deciding?.questionId === q.id && deciding.answerId === a.id" class="mt-2" @submit.prevent="confirmDecision()">
                    <label class="label" :for="`dec-${a.id}`">{{ m.rationale }}</label>
                    <textarea :id="`dec-${a.id}`" v-model="rationale" class="field min-h-16 resize-y text-[13px]" :placeholder="m.rationalePlaceholder" autofocus @keydown.ctrl.enter.prevent="confirmDecision()" />
                    <div class="mt-1.5 flex gap-1.5">
                      <BaseButton size="sm" variant="primary" type="submit" data-decision-confirm><Gavel :size="13" /> {{ m.confirmDecision }}</BaseButton>
                      <BaseButton size="sm" variant="ghost" @click="deciding = null">{{ common.actions.cancel }}</BaseButton>
                    </div>
                  </form>
                </div>
              </li>
            </ul>

            <div v-if="answering === q.id" class="mt-2">
              <MentionTextarea v-model="answerDraft" :placeholder="m.yourAnswer" autofocus @submit="answer(q.id)" />
              <div class="mt-1.5 flex gap-1.5">
                <BaseButton size="sm" variant="primary" :disabled="!answerDraft.trim()" @click="answer(q.id)">{{ m.answer }}</BaseButton>
                <BaseButton size="sm" variant="ghost" @click="answering = null; answerDraft = ''">{{ common.actions.cancel }}</BaseButton>
              </div>
            </div>
            <div v-else-if="!readOnly" class="mt-2 flex flex-wrap gap-1.5">
              <BaseButton v-if="!q.resolved" size="sm" variant="ghost" @click="answering = q.id"><CornerDownRight :size="13" /> {{ m.answer }}</BaseButton>
              <BaseButton v-if="!q.resolved && canResolve(q.authorId)" size="sm" variant="soft" @click="ws.resolveQuestion(projectId, item.id, q.id, true)">
                <CheckCircle2 :size="13" /> {{ m.markResolved }}
              </BaseButton>
              <BaseButton v-if="q.resolved && canResolve(q.authorId)" size="sm" variant="ghost" @click="ws.resolveQuestion(projectId, item.id, q.id, false)">
                <RotateCcw :size="13" /> {{ m.reopen }}
              </BaseButton>
              <BaseButton v-if="canResolve(q.authorId)" size="icon-sm" variant="ghost" :title="m.delete" class="ml-auto" @click="ws.deleteQuestion(projectId, item.id, q.id)">
                <Trash2 :size="13" />
              </BaseButton>
            </div>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="readOnly && !item.questions.length" class="text-[12.5px] text-ink-3">{{ m.none }}</p>
    <div v-if="!readOnly" class="mt-3">
      <MentionTextarea v-model="draft" :placeholder="ws.isNetwork ? m.askTag : m.ask" @submit="ask" />
      <p class="mt-1 text-[11.5px] text-ink-3">{{ m.hint }}</p>
    </div>
  </section>
</template>
