<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BarChart3, ChevronDown, Cloud, History, LogOut, Moon, Search, Settings, Sun, Users, WifiOff } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BrandMark from '@/components/ui/BrandMark.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
import NotificationsPanel from './NotificationsPanel.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'

const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()
const showSettings = ref(false)
const searchEl = ref<HTMLInputElement | null>(null)

const menu = computed(() => [
  { label: 'Impostazioni', icon: Settings, onSelect: () => (showSettings.value = true) },
  { label: 'Membri', icon: Users, onSelect: () => router.push({ name: 'members' }) },
  ...(ws.isAdmin
    ? [
        { label: 'Analisi', icon: BarChart3, onSelect: () => router.push({ name: 'analytics' }) },
        { label: 'Cronologia operazioni', icon: History, onSelect: () => router.push({ name: 'audit' }) },
      ]
    : []),
  { sep: true, label: '' },
  {
    label: 'Chiudi workspace',
    icon: LogOut,
    onSelect: async () => {
      await ws.close()
      router.push({ name: 'welcome' })
    },
  },
])

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchEl.value?.focus()
    searchEl.value?.select()
  }
})
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
    <BaseMenu :items="menu" align="start">
      <button class="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-surface-2 data-[state=open]:bg-surface-2">
        <BrandMark :size="20" />
        <span class="max-w-56 truncate text-[14px] font-bold tracking-tight">{{ ws.meta?.name }}</span>
        <ChevronDown :size="14" class="text-ink-3" />
      </button>
    </BaseMenu>

    <span
      v-if="ws.status === 'unreachable'"
      class="flex items-center gap-1.5 rounded-md bg-danger/10 px-2 py-1 text-[12.5px] font-medium text-danger"
      :title="ws.lastError ?? ''"
    >
      <WifiOff :size="14" /> Cartella non raggiungibile, riprovo…
    </span>

    <div class="relative ml-auto w-72">
      <Search :size="15" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        ref="searchEl"
        v-model="ui.search"
        class="field field-sm h-8 pl-8 pr-14"
        placeholder="Cerca nel progetto"
        @keydown.esc="ui.search = ''; ($event.target as HTMLInputElement).blur()"
      />
      <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5"><span class="kbd">Ctrl</span><span class="kbd">K</span></span>
    </div>

    <RouterLink
      :to="{ name: 'drive' }"
      class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
      active-class="bg-accent-soft text-accent-ink"
      title="Google Drive"
    >
      <Cloud :size="16" /> Drive
    </RouterLink>

    <RouterLink
      :to="{ name: 'members' }"
      class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
      active-class="bg-accent-soft text-accent-ink"
      title="Membri del workspace"
    >
      <Users :size="16" />
      <span class="tabular-nums">{{ ws.users.length }}</span>
    </RouterLink>

    <NotificationsPanel />

    <button class="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" :title="ui.isDark ? 'Tema chiaro (Ctrl+Shift+L)' : 'Tema scuro (Ctrl+Shift+L)'" @click="ui.toggleTheme()">
      <Sun v-if="ui.isDark" :size="16" />
      <Moon v-else :size="16" />
    </button>

    <button class="rounded-full" title="Impostazioni" @click="showSettings = true">
      <UserAvatar :name="ws.currentUser?.displayName ?? '?'" size="md" />
    </button>

    <SettingsDialog v-model:open="showSettings" />
  </header>
</template>
