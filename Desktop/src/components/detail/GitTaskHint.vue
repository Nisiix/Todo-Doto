<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Copy, GitCommitHorizontal } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useGitStore } from '@/stores/git'
import { useUiStore } from '@/stores/ui'
import { closePhrase, taskCode } from '@/services/gitLink'
import type { Item, Project } from '@/types'
import { DATE, defineMessages, locale } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Completa da un commit',
    lead: 'Scrivi nel messaggio del commit:',
    after: 'Quando il commit arriva nella cartella del progetto, il task si completa da solo. Valgono anche «closes», «fixes», «risolve»; più task: «chiude TODO-3, TODO-4».',
    copy: 'Copia',
    copied: (t: string) => `Copiato: ${t}`,
    closedBy: (hash: string, author: string, when: string) => `Completato dal commit ${hash}${author ? ` di ${author}` : ''}${when ? ` · ${when}` : ''}`,
  },
  en: {
    title: 'Complete from a commit',
    lead: 'Write in the commit message:',
    after: 'When the commit reaches the project folder, the task completes by itself. “fixes”, “resolves”, “chiude” work too; several tasks: “closes TODO-3, TODO-4”.',
    copy: 'Copy',
    copied: (t: string) => `Copied: ${t}`,
    closedBy: (hash: string, author: string, when: string) => `Completed by commit ${hash}${author ? ` by ${author}` : ''}${when ? ` · ${when}` : ''}`,
  },
})

/**
 * Nel dettaglio del task: come completarlo da un commit (solo se la cartella
 * del progetto è un repository git e la chiusura dai commit è attiva), oppure
 * da quale commit è stato completato.
 */
const props = defineProps<{ item: Item; project: Project }>()
const git = useGitStore()
const ui = useUiStore()

const phrase = computed(() => closePhrase(props.item.seq, locale === 'en' ? 'en' : 'it'))
const showHint = computed(
  () => props.item.bucket === 'todo' && props.item.seq > 0 && !!git.hasGit[props.project.id] && props.project.git.autoClose && !props.project.trashedAt,
)
const closed = computed(() => (props.item.bucket === 'done' ? props.item.closedByCommit : null))

async function copy() {
  try {
    await navigator.clipboard.writeText(phrase.value)
    ui.toast(m.copied(phrase.value), 'success', undefined, 1800)
  } catch {
    /* appunti non disponibili: il testo resta visibile da copiare a mano */
  }
}
</script>

<template>
  <div v-if="showHint" class="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12.5px]" data-git-hint>
    <p class="flex items-center gap-1.5 font-semibold text-ink-2"><GitCommitHorizontal :size="14" /> {{ m.title }} <span class="ml-auto font-mono text-[11.5px] font-medium text-ink-3">{{ taskCode(item.seq) }}</span></p>
    <p class="mt-1.5 text-ink-2">{{ m.lead }}</p>
    <div class="mt-1 flex items-center gap-2">
      <code class="rounded bg-surface px-2 py-1 font-mono text-[13px] font-semibold text-accent-ink" data-close-phrase>{{ phrase }}</code>
      <BaseButton size="sm" variant="ghost" @click="copy"><Copy :size="13" /> {{ m.copy }}</BaseButton>
    </div>
    <p class="mt-1.5 text-[11.5px] leading-snug text-ink-3">{{ m.after }}</p>
  </div>
  <p v-else-if="closed" class="flex items-start gap-1.5 text-[12px] text-ok" data-closed-by-commit>
    <GitCommitHorizontal :size="14" class="mt-px shrink-0" />
    <span>
      {{ m.closedBy(closed.hash.slice(0, 7), closed.author, closed.date ? dayjs(closed.date).format(DATE.date) : '') }}
      <span v-if="closed.subject" class="block italic text-ink-3">«{{ closed.subject }}»</span>
    </span>
  </p>
</template>
