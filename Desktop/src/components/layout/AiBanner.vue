<script setup lang="ts">
import { Sparkles, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAiStore } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    text: 'Attiva l’IA locale per potenziare Todo Doto: analisi dei progetti più precisa, configurazione più accurata e altre funzioni assistite. Funziona tutto sul tuo PC, senza connessioni esterne.',
    open: 'Apri Impostazioni',
    close: 'Non mostrare più',
  },
  en: {
    text: 'Turn on local AI to boost Todo Doto: more precise project analysis, more accurate setup and other assisted features. Everything runs on your PC, with no external connections.',
    open: 'Open Settings',
    close: 'Don’t show again',
  },
})

/**
 * Invito ad attivare l'IA locale: in sovrimpressione in alto, uguale in tutte
 * le sezioni e per tutti gli utenti. Compare solo finché l'IA non è attiva su
 * questo PC; chiuso con la X non ricompare più (scelta salvata sul PC).
 */
const ai = useAiStore()
const ui = useUiStore()
</script>

<template>
  <Transition enter-from-class="opacity-0 -translate-y-2" leave-to-class="opacity-0 -translate-y-2" enter-active-class="transition duration-200" leave-active-class="transition duration-150">
    <div v-if="ai.showBanner" class="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4" data-ai-banner>
      <div role="status" class="pointer-events-auto flex max-w-3xl items-center gap-3 rounded-lg border border-accent/40 bg-surface px-3.5 py-2.5 shadow-lg">
        <Sparkles :size="17" class="shrink-0 text-accent" />
        <p class="text-[13px] leading-snug text-ink-2">{{ m.text }}</p>
        <BaseButton size="sm" variant="primary" class="shrink-0" @click="ui.openSettings('ai')">{{ m.open }}</BaseButton>
        <BaseButton size="icon-sm" variant="ghost" class="shrink-0" :title="m.close" :aria-label="m.close" @click="ai.dismissBanner"><X :size="14" /></BaseButton>
      </div>
    </div>
  </Transition>
</template>
