<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUpdatesStore } from '@/stores/updates'
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmHost from '@/components/ui/ConfirmHost.vue'
import WhatsNewDialog from '@/components/dialogs/WhatsNewDialog.vue'
import { useEventListener } from '@vueuse/core'
import { installDiagnostics } from '@/services/diagnostics'
import { isTauri } from '@/services/fs'
import { setLocale, systemLocale } from '@/i18n'

installDiagnostics()

const session = useSessionStore()
const ui = useUiStore()
const ws = useWorkspaceStore()
const updates = useUpdatesStore()
const router = useRouter()
const booted = ref(false)

onMounted(async () => {
  await session.init()
  setLocale(session.config.locale ?? systemLocale())
  booted.value = true
  // Riapre l'ultimo workspace se possibile
  const last = session.config.recent[0]
  if (session.config.reopenLast && last && router.currentRoute.value.name === 'welcome') {
    const r = await ws.open(last.path)
    if (r.ok) router.replace({ name: 'workspace-home' })
  }
  // Controllo aggiornamenti silenzioso, dopo che l'interfaccia è pronta
  if (isTauri) setTimeout(() => void updates.check(true), 4000)
})

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    ui.toggleTheme()
  }
})
</script>

<template>
  <div class="h-full">
    <RouterView v-if="booted" />
    <div v-else class="flex h-full items-center justify-center text-ink-3">{{ t('Avvio…') }}</div>
    <ToastHost />
    <ConfirmHost />
    <WhatsNewDialog />
  </div>
</template>
