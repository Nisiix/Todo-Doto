<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { CheckCircle2, CircleHelp, CornerDownRight, RotateCcw, Trash2 } from 'lucide-vue-next'
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
  },
})

const props = defineProps<{ item: Item; projectId: string; readOnly?: boolean }>()
const ws = useWorkspaceStore()

const draft = ref('')
const answering = ref<string | null>(null)
const answerDraft = ref('')
const showResolved = ref(false)

const open = computed(() => props.item.questions.filter((q) => !q.resolved))
const resolved = computed(() => props.item.questions.filter((q) => q.resolved))

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
      <li v-for="q in showResolved ? item.questions : open" :key="q.id" class="rounded-lg border p-3" :class="q.resolved ? 'border-line opacity-70' : 'border-p-media/50 bg-p-media/5'">
        <div class="flex items-start gap-2.5">
          <component :is="q.resolved ? CheckCircle2 : CircleHelp" :size="16" class="mt-0.5 shrink-0" :class="q.resolved ? 'text-ok' : 'text-p-media'" />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2 text-[12px]">
              <span class="font-semibold text-ink">{{ ws.userName(q.authorId) }}</span>
              <span class="text-ink-3">{{ dayjs(q.createdAt).fromNow() }}</span>
              <span v-if="q.resolved" class="text-ok">{{ m.resolved }}</span>
            </div>
            <p class="text-[13.5px] leading-relaxed"><RichText :text="q.text" /></p>

            <ul v-if="q.answers.length" class="mt-2 space-y-2 border-l-2 border-line pl-3">
              <li v-for="a in q.answers" :key="a.id" class="flex gap-2">
                <UserAvatar :name="ws.userName(a.authorId)" size="xs" class="mt-0.5" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 text-[12px]">
                    <span class="font-semibold">{{ ws.userName(a.authorId) }}</span>
                    <span class="text-ink-3">{{ dayjs(a.createdAt).fromNow() }}</span>
                  </div>
                  <p class="text-[13px] leading-relaxed"><RichText :text="a.text" /></p>
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
