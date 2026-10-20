<script setup lang="ts">
import { computed } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { common } from '@/i18n/common'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Modifiche fatte fuori ufficio',
    description: 'Le tue modifiche sono state unite a quelle dei colleghi. Dove avete cambiato la stessa cosa è rimasta la loro versione: qui sotto c’è la tua, se vuoi riapplicarla.',
    project: (n: string) => `Progetto «${n}»`,
    mine: 'La tua',
    theirs: 'Ora',
    dropped: 'Task eliminati da un collega (la tua modifica non si è potuta applicare):',
    fields: {
      title: 'Titolo',
      notes: 'Descrizione',
      priority: 'Priorità',
      status: 'Stato e scadenza',
      label: 'Etichetta',
      assignee: 'Assegnatario',
      bucket: 'Completato / cestino',
    } as Record<string, string>,
    projectField: (k: string) => `Progetto: ${k}`,
    empty: '(vuoto)',
  },
  en: {
    title: 'Changes made away from the office',
    description: 'Your changes were merged with your colleagues’. Where you both changed the same thing, theirs was kept: yours is below, if you want to apply it again.',
    project: (n: string) => `Project “${n}”`,
    mine: 'Yours',
    theirs: 'Now',
    dropped: 'Tasks deleted by a colleague (your change could not be applied):',
    fields: {
      title: 'Title',
      notes: 'Description',
      priority: 'Priority',
      status: 'Status and due date',
      label: 'Label',
      assignee: 'Assignee',
      bucket: 'Completed / trash',
    } as Record<string, string>,
    projectField: (k: string) => `Project: ${k}`,
    empty: '(empty)',
  },
})

/** Resoconto dell'ultimo invio delle modifiche fatte fuori ufficio (solo se ci sono conflitti). */
const ws = useWorkspaceStore()
const open = computed({
  get: () => !!ws.offlineReport?.length,
  set: (v: boolean) => {
    if (!v) ws.offlineReport = null
  },
})
const label = (f: string) => (f.startsWith('project:') ? m.projectField(f.slice(8)) : (m.fields[f] ?? f))
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div class="space-y-5 text-[13px]" data-offline-report>
      <section v-for="r in ws.offlineReport ?? []" :key="r.project">
        <h3 class="mb-1.5 font-semibold">{{ m.project(r.project) }}</h3>
        <ul class="divide-y divide-line rounded-md border border-line">
          <li v-for="(c, i) in r.report.conflicts" :key="i" class="px-3 py-2">
            <p class="text-[12px] text-ink-3">{{ c.item ? `${c.item} · ` : '' }}{{ label(c.field) }}</p>
            <p><span class="text-ink-3">{{ m.mine }}:</span> <span class="font-medium">{{ c.mine || m.empty }}</span></p>
            <p><span class="text-ink-3">{{ m.theirs }}:</span> {{ c.theirs || m.empty }}</p>
          </li>
        </ul>
        <p v-if="r.report.dropped.length" class="mt-2 text-ink-2">{{ m.dropped }} {{ r.report.dropped.join(', ') }}</p>
      </section>
    </div>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">{{ common.actions.close }}</BaseButton>
    </template>
  </BaseDialog>
</template>
