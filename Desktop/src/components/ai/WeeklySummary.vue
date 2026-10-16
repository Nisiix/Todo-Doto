<script setup lang="ts">
import { computed, ref } from 'vue'
import { Copy, Loader2, Sparkles } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAiStore, withAi } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import { hasWeekFacts, weekFacts, weeklySummary, type WeekSummary } from '@/services/aiAssist'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Riepilogo della settimana',
    lead: 'Completati, novità, ritardi e scadenze dei progetti che vedi, in poche righe.',
    generate: 'Scrivi il riepilogo',
    again: 'Rigenera',
    writing: 'Scrivo il riepilogo…',
    failed: 'Non è stato possibile scrivere il riepilogo adesso. Controlla l’IA locale nelle Impostazioni.',
    copied: 'Riepilogo copiato',
  },
  en: {
    title: 'Weekly summary',
    lead: 'Completed, new, late and upcoming items of the projects you can see, in a few lines.',
    generate: 'Write the summary',
    again: 'Write again',
    writing: 'Writing the summary…',
    failed: 'Could not write the summary right now. Check the local AI in Settings.',
    copied: 'Summary copied',
  },
})

/** Riepilogo della settimana scritto dall'IA locale a partire dai soli dati dei progetti visibili. */
const ai = useAiStore()
const ws = useWorkspaceStore()
const ui = useUiStore()
const facts = computed(() => weekFacts(ws.visibleProjects))
const result = ref<WeekSummary | null>(null)
const busy = ref(false)
const failed = ref(false)

async function generate() {
  busy.value = true
  failed.value = false
  const r = await withAi((cfg) => weeklySummary(cfg, facts.value))
  busy.value = false
  if (r) result.value = r
  else failed.value = true
}
async function copy() {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText([result.value.summary, ...result.value.highlights.map((h) => `- ${h}`)].join('\n'))
    ui.toast(m.copied, 'success', undefined, 1500)
  } catch {
    /* appunti non disponibili */
  }
}
</script>

<template>
  <section v-if="ai.active && hasWeekFacts(facts)" class="mt-10 max-w-5xl rounded-lg border border-line bg-surface p-5" data-weekly-summary>
    <div class="flex flex-wrap items-center gap-2">
      <Sparkles :size="16" class="text-accent" />
      <h2 class="text-[15px] font-bold">{{ m.title }}</h2>
      <span class="flex-1" />
      <BaseButton v-if="result" size="sm" variant="ghost" @click="copy"><Copy :size="13" /> {{ common.actions.copy }}</BaseButton>
      <BaseButton size="sm" :variant="result ? 'ghost' : 'primary'" :disabled="busy" data-weekly-generate @click="generate">{{ result ? m.again : m.generate }}</BaseButton>
    </div>
    <p v-if="!result && !busy && !failed" class="mt-1 text-[13px] text-ink-3">{{ m.lead }}</p>
    <p v-if="busy" class="mt-3 flex items-center gap-2 text-[13px] text-ink-2"><Loader2 :size="14" class="animate-spin" /> {{ m.writing }}</p>
    <p v-else-if="failed" class="mt-3 text-[13px] text-danger">{{ m.failed }}</p>
    <div v-else-if="result" class="mt-3 space-y-2 text-[13.5px] leading-relaxed" data-weekly-text>
      <p>{{ result.summary }}</p>
      <ul v-if="result.highlights.length" class="list-disc space-y-0.5 pl-5 text-ink-2">
        <li v-for="(h, i) in result.highlights" :key="i">{{ h }}</li>
      </ul>
    </div>
  </section>
</template>
