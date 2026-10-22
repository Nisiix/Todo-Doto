<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmHost from '@/components/ui/ConfirmHost.vue'
import UpdateBanner from '@/components/layout/UpdateBanner.vue'
import FeedbackDialog from '@/components/dialogs/FeedbackDialog.vue'
import DonateDialog from '@/components/dialogs/DonateDialog.vue'
import { useUpdatesStore } from '@/stores/updates'
import { isTauri } from '@/services/fs'
import { useEventListener } from '@vueuse/core'
import { defineMessages } from '@/i18n'

const { starting, opening } = defineMessages({
  it: { starting: 'Avvio…', opening: (n: string) => `Apro «${n}»…` },
  en: { starting: 'Starting…', opening: (n: string) => `Opening “${n}”…` },
})

const session = useSessionStore()
const ui = useUiStore()
const ws = useWorkspaceStore()
const router = useRouter()
const updates = useUpdatesStore()
const booted = ref(false)
/** Workspace che si sta riaprendo all'avvio (mostrato al posto di "Avvio…"). */
const reopening = ref('')

onMounted(async () => {
  await session.init()
  await router.isReady()
  // Riapre l'ultimo workspace prima di mostrare qualsiasi pagina: niente passaggio
  // dalla scelta del workspace (che comparirebbe per un attimo e poi sparirebbe)
  const last = session.config.recent[0]
  if (session.config.reopenLast && last && router.currentRoute.value.name === 'welcome') {
    reopening.value = last.name
    try {
      const r = await ws.open(last.path)
      if (r.ok) await router.replace({ name: 'workspace-home' })
    } catch {
      /* se non si apre si resta sulla scelta del workspace */
    }
  }
  booted.value = true
  // Nuova versione su GitHub: nell'app desktop (nell'anteprima del browser solo se un test lo chiede)
  if (isTauri || (window as unknown as { __pgmUpdates?: boolean }).__pgmUpdates) void updates.autoCheck()
})

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    ui.toggleTheme()
  }
})
</script>

<template>
  <div class="flex h-full flex-col">
    <UpdateBanner />
    <div class="min-h-0 flex-1">
      <RouterView v-if="booted" />
      <div v-else class="flex h-full items-center justify-center text-ink-3" data-starting>{{ reopening ? opening(reopening) : starting }}</div>
    </div>
    <ToastHost />
    <ConfirmHost />
    <FeedbackDialog v-model:open="ui.feedbackOpen" />
    <DonateDialog v-model:open="ui.donateOpen" />
  </div>
</template>
