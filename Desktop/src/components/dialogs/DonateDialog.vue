<script setup lang="ts">
import { Copy, Heart, Mail } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
import { APP_VERSION, AUTHOR_EMAIL, DONATE_URL } from '@/services/branding'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Sostieni Todo Doto',
    description: 'Todo Doto è gratuito, senza pubblicità e senza raccolta di dati. Se ti è utile, una donazione aiuta a dedicargli tempo: correzioni, nuove funzioni, risposte alle segnalazioni.',
    paypal: 'Dona con PayPal',
    paypalHint: 'Si apre la pagina di PayPal: scegli tu l’importo, anche senza un conto PayPal (con la carta).',
    address: 'Oppure invia a questo indirizzo PayPal',
    copy: 'Copia l’indirizzo',
    copied: 'Indirizzo copiato',
    write: 'Scrivi',
    thanks: 'Grazie! Anche una segnalazione o un consiglio a un collega sono un ottimo modo per sostenere il progetto.',
    subject: (v: string) => `Todo Doto ${v} · Donazione`,
  },
  en: {
    title: 'Support Todo Doto',
    description: 'Todo Doto is free, with no ads and no data collection. If you find it useful, a donation helps me spend time on it: fixes, new features, answers to reports.',
    paypal: 'Donate with PayPal',
    paypalHint: 'PayPal’s page opens: you choose the amount, even without a PayPal account (by card).',
    address: 'Or send to this PayPal address',
    copy: 'Copy the address',
    copied: 'Address copied',
    write: 'Write',
    thanks: 'Thank you! A report or a word to a colleague are great ways to support the project too.',
    subject: (v: string) => `Todo Doto ${v} · Donation`,
  },
})

/** Donazioni: PayPal (pagina di donazione o invio diretto all'indirizzo dell'autore). */
const open = defineModel<boolean>('open', { default: false })
const ui = useUiStore()

const openUrl = async (url: string) => (await getFs()).openExternal(url, 'link')
async function copy() {
  await navigator.clipboard.writeText(AUTHOR_EMAIL)
  ui.toast(m.copied, 'success', undefined, 1800)
}
const mailto = `mailto:${AUTHOR_EMAIL}?subject=${encodeURIComponent(m.subject(APP_VERSION))}`
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description">
    <div class="space-y-4 text-[13px]" data-donate-dialog>
      <div>
        <BaseButton variant="primary" data-donate-paypal @click="openUrl(DONATE_URL)"><Heart :size="15" /> {{ m.paypal }}</BaseButton>
        <p class="mt-1.5 text-[12px] text-ink-3">{{ m.paypalHint }}</p>
      </div>
      <div>
        <p class="label">{{ m.address }}</p>
        <div class="flex items-center gap-2 rounded-md border border-line px-3 py-2">
          <span class="min-w-0 flex-1 truncate font-mono text-[13px]" data-donate-address>{{ AUTHOR_EMAIL }}</span>
          <BaseButton size="sm" variant="ghost" :title="m.copy" data-donate-copy @click="copy"><Copy :size="13" /> {{ m.copy }}</BaseButton>
          <BaseButton size="sm" variant="ghost" :title="AUTHOR_EMAIL" @click="openUrl(mailto)"><Mail :size="13" /> {{ m.write }}</BaseButton>
        </div>
      </div>
      <p class="text-[12.5px] leading-snug text-ink-2">{{ m.thanks }}</p>
    </div>
  </BaseDialog>
</template>
