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

const { starting } = defineMessages({ it: { starting: 'Avvio…' }, en: { starting: 'Starting…' } })

const session = useSessionStore()
const ui = useUiStore()
const ws = useWorkspaceStore()
const router = useRouter()
const booted = ref(false)

onMounted(async () => {
  await session.init()
  booted.value = true
  // Riapre l'ultimo workspace se possibile
  const last = session.config.recent[0]
  if (session.config.reopenLast && last && router.currentRoute.value.name === 'welcome') {
    const r = await ws.open(last.path)
    if (r.ok) router.replace({ name: 'workspace-home' })
  }
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
    <div v-else class="flex h-full items-center justify-center text-ink-3">{{ starting }}</div>
    <ToastHost />
    <ConfirmHost />
  </div>
</template>
