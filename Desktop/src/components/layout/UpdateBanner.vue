<script setup lang="ts">
import { ArrowUpCircle, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useUpdatesStore } from '@/stores/updates'
import { getFs } from '@/services/fs'
import { APP_VERSION, DOWNLOAD_URL } from '@/services/branding'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    text: (v: string, cur: string) => `È disponibile Todo Doto ${v} (questa è la ${cur}).`,
    hint: 'Si installa sopra quella attuale: dati e impostazioni restano.',
    notes: 'Novità',
    download: 'Scarica',
    later: 'Più tardi',
  },
  en: {
    text: (v: string, cur: string) => `Todo Doto ${v} is available (this is ${cur}).`,
    hint: 'It installs over the current one: data and settings are kept.',
    notes: 'What’s new',
    download: 'Download',
    later: 'Later',
  },
})

/** Avviso di nuova versione, in cima alla finestra; «Più tardi» non lo ripropone per quella versione. */
const updates = useUpdatesStore()
const openUrl = async (url: string) => (await getFs()).openExternal(url, 'link')
</script>

<template>
  <div v-if="updates.showBanner && updates.available" class="flex shrink-0 items-center gap-3 border-b border-line bg-accent-soft px-4 py-1.5 text-[13px] text-accent-ink" role="status" data-update-banner>
    <ArrowUpCircle :size="16" class="shrink-0" />
    <span class="min-w-0 flex-1 truncate">
      <b class="font-semibold">{{ m.text(updates.available.version, APP_VERSION) }}</b>
      <span class="ml-1 text-ink-2">{{ m.hint }}</span>
    </span>
    <BaseButton size="sm" variant="ghost" data-update-notes @click="openUrl(updates.available.url)">{{ m.notes }}</BaseButton>
    <BaseButton size="sm" variant="primary" data-update-download @click="openUrl(DOWNLOAD_URL)">{{ m.download }}</BaseButton>
    <button type="button" class="rounded-md p-1 hover:bg-surface/60" :title="m.later" :aria-label="m.later" data-update-later @click="updates.skip()"><X :size="14" /></button>
  </div>
</template>
