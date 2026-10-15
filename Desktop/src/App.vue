<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmHost from '@/components/ui/ConfirmHost.vue'
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
    <div v-else class="flex h-full items-center justify-center text-ink-3" data-starting>{{ reopening ? opening(reopening) : starting }}</div>
    <ToastHost />
    <ConfirmHost />
  </div>
</template>
