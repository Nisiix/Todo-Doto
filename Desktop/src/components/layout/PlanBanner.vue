<script setup lang="ts">
import { t, tn } from '@/i18n'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, FlaskConical, Info, Lock } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { PLANS, TRIAL_DAYS } from '@/services/license'

/**
 * Striscia sotto la barra superiore: compare solo quando c'è qualcosa da
 * decidere (membri oltre i posti, prova in scadenza, licenza non valida,
 * workspace di esempio). Mai per chi sta semplicemente lavorando.
 */
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()

type Action = { label: string; primary?: boolean; run: () => void }
type Banner = { tone: 'info' | 'warn' | 'danger'; icon: typeof Info; text: string; actions: Action[] }

const banner = computed<Banner | null>(() => {
  const p = ws.plan
  const openLicense: Action = { label: t('Attiva licenza'), primary: true, run: () => (ui.showLicense = true) }
  if (ws.isDemo) {
    return {
      tone: 'info',
      icon: Info,
      text: t('Questo è un workspace di esempio con dati inventati: esplora liberamente, poi crea il tuo.'),
      actions: [{ label: t('Crea il mio workspace'), primary: true, run: () => router.push({ name: 'welcome', query: { create: '1' } }) }],
    }
  }
  if (!ws.hasSeat) {
    return {
      tone: 'danger',
      icon: Lock,
      text: t('Sei in sola lettura: il workspace ha {n} membri e il piano {plan} ne include {seats}. Chiedi all’amministratore di attivare una licenza.', { n: ws.users.length, plan: PLANS[p.plan].label, seats: p.seats ?? 0 }),
      actions: [],
    }
  }
  if (ws.isAdmin && ws.licenseError) {
    return { tone: 'danger', icon: AlertTriangle, text: t('Il file license.json nella cartella non è valido ({error}).', { error: ws.licenseError ?? '' }), actions: [openLicense] }
  }
  if (ws.isAdmin && ws.overSeats) {
    const actions: Action[] = [openLicense]
    if (!p.trialUsed) actions.unshift({ label: t('Avvia prova di {n} giorni', { n: TRIAL_DAYS }), primary: true, run: () => void ws.startTrial() })
    return {
      tone: 'warn',
      icon: AlertTriangle,
      text: t('{n} membri, {seats} posti nel piano {plan}: chi è oltre lavora in sola lettura.', { n: ws.users.length, seats: p.seats ?? 0, plan: PLANS[p.plan].label }),
      actions,
    }
  }
  if (ws.isAdmin && p.source === 'trial' && p.trialDaysLeft <= 7) {
    return {
      tone: 'warn',
      icon: FlaskConical,
      text: t('Prova del piano Team: {left}. Alla scadenza il workspace torna al piano Free.', { left: tn(p.trialDaysLeft, 'ultimo giorno', '{n} giorni rimasti') }),
      actions: [openLicense],
    }
  }
  return null
})

const tones = {
  info: 'bg-accent-soft/60 text-accent-ink',
  warn: 'bg-p-media/15 text-ink',
  danger: 'bg-danger/10 text-danger',
}
</script>

<template>
  <div v-if="banner" class="flex shrink-0 items-center gap-3 border-b border-line px-4 py-1.5 text-[13px]" :class="tones[banner.tone]" role="status">
    <component :is="banner.icon" :size="15" class="shrink-0" />
    <span class="min-w-0 flex-1">{{ banner.text }}</span>
    <BaseButton v-for="a in banner.actions" :key="a.label" size="sm" :variant="a.primary ? 'primary' : 'outline'" @click="a.run">{{ a.label }}</BaseButton>
  </div>
</template>
