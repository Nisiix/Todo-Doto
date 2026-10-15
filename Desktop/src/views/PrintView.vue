<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ArrowLeft, Printer } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { BUCKET_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '@/types'
import { sortForBucket } from '@/services/items'
import { APP_NAME } from '@/services/branding'

/**
 * Versione stampabile della roadmap di un progetto: la finestra di stampa
 * di Windows permette di salvarla come PDF («Microsoft Print to PDF»).
 */
const props = defineProps<{ id: string }>()
const ws = useWorkspaceStore()
const router = useRouter()
const project = computed(() => ws.projects[props.id] ?? null)

const sections = computed(() =>
  (['todo', 'done'] as const)
    .map((bucket) => ({ bucket, label: t(BUCKET_LABEL[bucket]), items: sortForBucket(project.value?.items.filter((i) => i.bucket === bucket) ?? [], bucket) }))
    .filter((s) => s.items.length),
)
const labelName = (id: string | null) => (id ? (ws.labelsById[id]?.name ?? '') : '')
const today = dayjs().format('D MMMM YYYY')

onMounted(() => {
  if (!project.value) router.replace({ name: 'workspace-home' })
})
const print = () => window.print()
</script>

<template>
  <div v-if="project" class="print-page mx-auto max-w-4xl bg-white px-10 py-8 text-[13px] text-black dark:bg-white">
    <div class="print:hidden mb-6 flex items-center gap-2">
      <BaseButton size="sm" @click="router.back()"><ArrowLeft :size="14" /> {{ t('Torna al progetto') }}</BaseButton>
      <BaseButton size="sm" variant="primary" @click="print"><Printer :size="14" /> {{ t('Stampa o salva come PDF') }}</BaseButton>
      <span class="text-[12px] text-ink-3">{{ t('Nella finestra di stampa scegli «Microsoft Print to PDF» per ottenere un file.') }}</span>
    </div>

    <header class="border-b border-black/20 pb-3">
      <p class="text-[11px] uppercase tracking-wide text-black/50">{{ ws.meta?.name }} · {{ t('roadmap al {date}', { date: today }) }}</p>
      <h1 class="mt-1 text-[24px] font-extrabold leading-tight tracking-tight">{{ project.name }}</h1>
      <p v-if="project.description" class="mt-1 text-black/70">{{ project.description }}</p>
    </header>

    <section v-for="s in sections" :key="s.bucket" class="mt-6 break-inside-avoid">
      <h2 class="mb-2 text-[15px] font-bold">{{ s.label }} <span class="font-medium text-black/50">({{ s.items.length }})</span></h2>
      <table class="w-full border-collapse">
        <thead>
          <tr class="border-b border-black/30 text-left text-[11px] uppercase tracking-wide text-black/50">
            <th class="py-1 pr-2 font-semibold">{{ t('Elemento') }}</th>
            <th class="w-24 py-1 pr-2 font-semibold">{{ t('Priorità') }}</th>
            <th class="w-28 py-1 pr-2 font-semibold">{{ t('Stato') }}</th>
            <th class="w-24 py-1 pr-2 font-semibold">{{ t('Scadenza') }}</th>
            <th class="w-28 py-1 font-semibold">{{ t('Etichetta') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in s.items" :key="it.id" class="border-b border-black/10 align-top">
            <td class="py-1.5 pr-2">
              <span class="font-semibold">{{ it.title }}</span>
              <span v-if="it.notes" class="block whitespace-pre-wrap text-[12px] text-black/60">{{ it.notes }}</span>
              <span v-if="it.questions.some((q) => !q.resolved)" class="block text-[12px] text-black/60">{{ it.questions.filter((q) => !q.resolved).length }} domande aperte</span>
            </td>
            <td class="py-1.5 pr-2">
              <span class="inline-block h-2.5 w-2.5 rounded-full align-middle" :class="`bg-p-${it.priority}`" /> {{ t(PRIORITY_LABEL[it.priority]) }}
            </td>
            <td class="py-1.5 pr-2">{{ t(STATUS_LABEL[it.status]) }}</td>
            <td class="py-1.5 pr-2 tabular-nums">{{ it.dueDate ? dayjs(it.dueDate).format('D MMM YYYY') : '' }}</td>
            <td class="py-1.5">{{ labelName(it.labelId) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <p v-if="!sections.length" class="mt-6 text-black/60">{{ t('Il progetto non ha ancora elementi.') }}</p>

    <footer class="mt-8 border-t border-black/20 pt-2 text-[10.5px] text-black/50">{{ t('Generato con') }} {{ APP_NAME }}</footer>
  </div>
</template>

<style>
@media print {
  @page { margin: 14mm; }
  html, body, #app { background: #fff !important; height: auto !important; overflow: visible !important; }
  .print-page { max-width: none; padding: 0; }
}
</style>
