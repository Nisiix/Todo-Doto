<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { Copy, GitBranch, GitCommitHorizontal } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useGitStore } from '@/stores/git'
import { useUiStore } from '@/stores/ui'
import { branchName, seqFromBranch, subjectOf, taskCode } from '@/services/gitLink'
import type { Item, Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    branch: 'Branch del task',
    branchHint: 'I commit su questo branch che citano il codice del task compaiono qui sotto, e il task risulta in lavorazione.',
    onThisPc: 'aperto su questo PC',
    copyName: 'Copia il nome',
    copyCmd: 'Copia il comando',
    copied: (t: string) => `Copiato: ${t}`,
    commits: (code: string) => `Commit che citano ${code}`,
    closes: 'chiude',
    showAll: (n: number) => `Mostra tutti (${n})`,
    none: (code: string) => `Nessun commit cita ancora ${code}: scrivilo nel messaggio per vedere qui il lavoro fatto.`,
  },
  en: {
    branch: 'Task branch',
    branchHint: 'Commits on this branch citing the task code appear below, and the task shows as in progress.',
    onThisPc: 'checked out on this PC',
    copyName: 'Copy the name',
    copyCmd: 'Copy the command',
    copied: (t: string) => `Copied: ${t}`,
    commits: (code: string) => `Commits citing ${code}`,
    closes: 'closes',
    showAll: (n: number) => `Show all (${n})`,
    none: (code: string) => `No commit cites ${code} yet: write it in the message to see the work done here.`,
  },
})

/**
 * Attività git del task (cartella del progetto con .git): il nome del branch da
 * creare, se è aperto su questo PC, e i commit che citano il codice del task.
 * Tutto in sola lettura: l'app non esegue mai git per conto dell'utente.
 */
const props = defineProps<{ item: Item; project: Project }>()
const git = useGitStore()
const ui = useUiStore()

const show = computed(() => !!git.hasGit[props.project.id] && props.item.seq > 0)
const code = computed(() => taskCode(props.item.seq))
const name = computed(() => branchName(props.item.seq, props.item.title))
const current = computed(() => git.branch[props.project.id] ?? null)
const onThisPc = computed(() => seqFromBranch(current.value) === props.item.seq)
const list = computed(() => git.commitsOf(props.project.id, props.item))
const all = ref(false)
const shown = computed(() => (all.value ? list.value : list.value.slice(0, 5)))

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ui.toast(m.copied(text), 'success', undefined, 1800)
  } catch {
    /* appunti non disponibili: il testo resta visibile da copiare a mano */
  }
}
</script>

<template>
  <div v-if="show" class="space-y-3 text-[12.5px]" data-git-activity>
    <div v-if="item.bucket === 'todo'" class="rounded-lg border border-line px-3 py-2.5">
      <p class="flex items-center gap-1.5 font-semibold text-ink-2">
        <GitBranch :size="14" /> {{ m.branch }}
        <span v-if="onThisPc" class="ml-auto rounded-full bg-ok/10 px-2 text-[11px] font-medium text-ok" data-branch-here>{{ m.onThisPc }}</span>
      </p>
      <p class="mt-1.5 truncate font-mono text-[12px] text-ink" :title="onThisPc ? current ?? '' : name" data-branch-name>{{ onThisPc ? current : name }}</p>
      <div v-if="!onThisPc" class="mt-1.5 flex gap-1.5">
        <BaseButton size="sm" variant="ghost" data-copy-branch @click="copy(name)"><Copy :size="12" /> {{ m.copyName }}</BaseButton>
        <BaseButton size="sm" variant="ghost" data-copy-switch @click="copy(`git switch -c ${name}`)"><Copy :size="12" /> {{ m.copyCmd }}</BaseButton>
      </div>
      <p class="mt-1 text-[11.5px] text-ink-3">{{ m.branchHint }}</p>
    </div>

    <div v-if="list.length || item.bucket === 'todo'">
      <p class="mb-1 flex items-center gap-1.5 font-semibold text-ink-2"><GitCommitHorizontal :size="14" /> {{ m.commits(code) }} <span v-if="list.length" class="tabular-nums text-ink-3">{{ list.length }}</span></p>
      <ul v-if="list.length" class="space-y-1 border-l-2 border-line pl-3" data-task-commits>
        <li v-for="t in shown" :key="t.commit.hash">
          <p class="flex items-baseline gap-1.5">
            <span class="font-mono text-[11.5px] text-ink-3">{{ t.commit.hash.slice(0, 7) }}</span>
            <span class="min-w-0 flex-1 truncate" :title="t.commit.message">{{ subjectOf(t.commit.message) }}</span>
            <span v-if="t.closes" class="shrink-0 rounded-full bg-ok/10 px-1.5 text-[10.5px] font-medium text-ok">{{ m.closes }}</span>
          </p>
          <p class="text-[11.5px] text-ink-3">{{ t.commit.author }}<template v-if="t.commit.date"> · {{ dayjs(t.commit.date).fromNow() }}</template></p>
        </li>
      </ul>
      <button v-if="list.length > shown.length" type="button" class="mt-1 text-[12px] font-medium text-accent-ink hover:underline" @click="all = true">{{ m.showAll(list.length) }}</button>
      <p v-if="!list.length" class="text-[11.5px] text-ink-3">{{ m.none(code) }}</p>
    </div>
  </div>
</template>
