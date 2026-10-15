<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import changelog from '../../../CHANGELOG.md?raw'
import { APP_VERSION } from '@/services/branding'
import { parseChangelog } from '@/services/changelog'
import { useUiStore } from '@/stores/ui'

/**
 * «Novità in questa versione»: la prima sezione di CHANGELOG.md, mostrata una
 * volta dopo ogni aggiornamento (non al primo avvio in assoluto) e su richiesta
 * da Impostazioni → Novità. Montato una sola volta, in App.vue.
 */
const KEY = 'pgm:seenVersion'
const ui = useUiStore()
const open = computed({ get: () => ui.showWhatsNew, set: (v) => (ui.showWhatsNew = v) })

const latest = computed(() => parseChangelog(changelog)[0] ?? null)

onMounted(() => {
  try {
    const seen = localStorage.getItem(KEY)
    if (seen && seen !== APP_VERSION && latest.value) open.value = true
    localStorage.setItem(KEY, APP_VERSION)
  } catch {
    /* storage non disponibile */
  }
})
</script>

<template>
  <BaseDialog v-model:open="open" :title="`Novità nella versione ${APP_VERSION}`">
    <template v-if="latest">
      <p class="mb-2 text-[12.5px] text-ink-3">{{ latest.title }}</p>
      <ul class="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2">
        <li v-for="(it, i) in latest.items" :key="i">{{ it }}</li>
      </ul>
    </template>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">{{ t('Ok') }}</BaseButton>
    </template>
  </BaseDialog>
</template>
