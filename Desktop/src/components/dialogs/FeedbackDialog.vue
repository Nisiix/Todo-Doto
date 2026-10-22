<script setup lang="ts">
import { computed } from 'vue'
import { Bug, CircleHelp, Lightbulb, Mail } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import { getFs } from '@/services/fs'
import { APP_VERSION, AUTHOR_EMAIL } from '@/services/branding'
import { feedbackUrl, osLabel, type FeedbackKind } from '@/services/feedback'
import { defineMessages, locale } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Invia un feedback',
    description: 'Todo Doto migliora con quello che racconti: cosa non va, cosa manca, cosa ti piace. Ogni messaggio viene letto.',
    bug: 'Segnala un problema',
    bugHint: 'Qualcosa non funziona come dovrebbe. Si apre una segnalazione su GitHub, con la versione già compilata.',
    idea: 'Proponi un’idea',
    ideaHint: 'Una funzione nuova o un miglioramento. Se ne discute con gli altri utenti su GitHub.',
    question: 'Fai una domanda',
    questionHint: 'Come si fa…? Rispondono l’autore e la community.',
    email: 'Scrivi all’autore',
    emailHint: (a: string) => `Un’email a ${a}, con il programma di posta di questo PC. Per quello che preferisci non scrivere in pubblico.`,
    github: 'Le prime tre richiedono un account GitHub gratuito e sono pubbliche: non scrivere password o dati riservati. Nei link va solo la versione dell’app e del sistema.',
    subject: { bug: 'Problema', idea: 'Idea', question: 'Domanda', email: 'Feedback' } as Record<FeedbackKind, string>,
    version: (v: string) => `Versione ${v}`,
  },
  en: {
    title: 'Send feedback',
    description: 'Todo Doto gets better with what you tell: what is wrong, what is missing, what you like. Every message is read.',
    bug: 'Report a problem',
    bugHint: 'Something does not work as it should. A GitHub issue opens with the version already filled in.',
    idea: 'Suggest an idea',
    ideaHint: 'A new feature or an improvement, discussed with other users on GitHub.',
    question: 'Ask a question',
    questionHint: 'How do I…? The author and the community answer.',
    email: 'Write to the author',
    emailHint: (a: string) => `An email to ${a}, with this PC’s mail program. For whatever you would rather not write in public.`,
    github: 'The first three need a free GitHub account and are public: do not write passwords or confidential data. The links only carry the app and system version.',
    subject: { bug: 'Problem', idea: 'Idea', question: 'Question', email: 'Feedback' } as Record<FeedbackKind, string>,
    version: (v: string) => `Version ${v}`,
  },
})

/** «Invia un feedback»: segnalazioni, idee e domande su GitHub, oppure un'email all'autore. */
const open = defineModel<boolean>('open', { default: false })

const info = computed(() => ({ version: APP_VERSION, os: osLabel(navigator.userAgent), locale }))
const options = computed(() => [
  { kind: 'bug' as const, icon: Bug, title: m.bug, hint: m.bugHint, tone: 'text-danger' },
  { kind: 'idea' as const, icon: Lightbulb, title: m.idea, hint: m.ideaHint, tone: 'text-p-media' },
  { kind: 'question' as const, icon: CircleHelp, title: m.question, hint: m.questionHint, tone: 'text-accent' },
  { kind: 'email' as const, icon: Mail, title: m.email, hint: m.emailHint(AUTHOR_EMAIL), tone: 'text-ink-2' },
])

async function go(kind: FeedbackKind) {
  const url = feedbackUrl(kind, info.value, (k) => `Todo Doto ${APP_VERSION} · ${m.subject[k]}`)
  open.value = false
  await (await getFs()).openExternal(url, 'link')
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description">
    <div class="space-y-3 text-[13px]" data-feedback>
      <ul class="space-y-2">
        <li v-for="o in options" :key="o.kind">
          <button type="button" class="flex w-full items-start gap-3 rounded-md border border-line px-3 py-2.5 text-left hover:border-line-strong hover:bg-surface-2" :data-feedback-kind="o.kind" @click="go(o.kind)">
            <component :is="o.icon" :size="17" class="mt-0.5 shrink-0" :class="o.tone" />
            <span class="min-w-0">
              <span class="block font-semibold">{{ o.title }}</span>
              <span class="block text-[12.5px] leading-snug text-ink-2">{{ o.hint }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p class="text-[12px] leading-snug text-ink-3">{{ m.github }}</p>
      <p class="text-[12px] text-ink-3" data-feedback-version>{{ m.version(APP_VERSION) }}</p>
    </div>
  </BaseDialog>
</template>
