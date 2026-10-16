<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, GitCommitHorizontal, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useGitStore } from '@/stores/git'
import { firstLine } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: (n: number) => (n === 1 ? 'Un commit recente potrebbe completare un task' : `${n} commit recenti potrebbero completare dei task`),
    lead: 'Non citano «chiude TODO-n»: controlla e conferma tu.',
    complete: 'Completa',
    ignore: 'Ignora',
  },
  en: {
    title: (n: number) => (n === 1 ? 'A recent commit may complete a task' : `${n} recent commits may complete tasks`),
    lead: 'They do not mention “closes TODO-n”: check and confirm.',
    complete: 'Complete',
    ignore: 'Ignore',
  },
})

/** Suggerimenti (IA locale) di task completati da commit che non li citano: si confermano uno per uno. */
const props = defineProps<{ project: Project }>()
const git = useGitStore()
const list = computed(() => {
  void git.suggestions[props.project.id] // dipendenza reattiva
  return git.pending(props.project).map((s) => ({ s, item: props.project.items.find((i) => i.id === s.itemId)! }))
})
</script>

<template>
  <section v-if="list.length" class="mb-4 rounded-md border border-accent/40 bg-accent-soft/40 px-3 py-2.5" data-commit-suggestions>
    <p class="flex items-center gap-2 text-[13px] font-semibold"><GitCommitHorizontal :size="15" class="text-accent" /> {{ m.title(list.length) }}</p>
    <p class="mb-2 text-[12px] text-ink-3">{{ m.lead }}</p>
    <ul class="space-y-1.5">
      <li v-for="{ s, item } in list" :key="s.hash" class="flex flex-wrap items-center gap-2 text-[13px]" data-commit-suggestion>
        <span class="min-w-0 flex-1">
          <span class="font-mono text-[12px] text-ink-3">{{ s.hash.slice(0, 7) }}</span>
          «{{ s.subject }}» → <span class="font-semibold">{{ taskCode(item.seq) }}</span> {{ firstLine(item.title) }}
          <span v-if="s.reason" class="block text-[12px] text-ink-3">{{ s.reason }}</span>
        </span>
        <BaseButton size="sm" variant="primary" @click="git.acceptSuggestion(project.id, s)"><CheckCircle2 :size="13" /> {{ m.complete }}</BaseButton>
        <BaseButton size="sm" variant="ghost" :title="m.ignore" @click="git.dismissSuggestion(project.id, s)"><X :size="13" /> {{ m.ignore }}</BaseButton>
      </li>
    </ul>
  </section>
</template>
