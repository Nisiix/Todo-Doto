<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import GitHubMark from '@/components/ui/GitHubMark.vue'
import { AlertTriangle, Archive, BarChart3, ChevronDown, Cloud, History, Keyboard, LogOut, Moon, Settings, Sun, Tag, Users, WifiOff } from 'lucide-vue-next'
import dayjs from 'dayjs'
import { useEventListener } from '@vueuse/core'
import BrandMark from '@/components/ui/BrandMark.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
import LabelsDialog from '@/components/dialogs/LabelsDialog.vue'
import ShortcutsDialog from '@/components/dialogs/ShortcutsDialog.vue'
import NotificationsPanel from './NotificationsPanel.vue'
import GlobalSearch from './GlobalSearch.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    settings: 'Impostazioni',
    labels: 'Etichette',
    members: 'Membri',
    analytics: 'Analisi',
    audit: 'Cronologia operazioni',
    shortcuts: 'Scorciatoie da tastiera',
    closeWs: 'Chiudi workspace',
    backupLast: (when: string) => `Ultima copia dei dati: ${when}`,
    backupNone: 'Nessuna copia dei dati ancora',
    backupOld: (days: number) => `Nessuna copia dei dati da ${days} giorni`,
    backupFailed: 'Copia dei dati non riuscita: vedi Impostazioni',
    unreachable: 'Cartella non raggiungibile, riprovo…',
    wsMembers: 'Membri del workspace',
    lightTheme: 'Tema chiaro (Ctrl+Shift+L)',
    darkTheme: 'Tema scuro (Ctrl+Shift+L)',
  },
  en: {
    settings: 'Settings',
    labels: 'Labels',
    members: 'Members',
    analytics: 'Analytics',
    audit: 'Activity log',
    shortcuts: 'Keyboard shortcuts',
    closeWs: 'Close workspace',
    backupLast: (when: string) => `Last data backup: ${when}`,
    backupNone: 'No data backup yet',
    backupOld: (days: number) => `No data backup for ${days} days`,
    backupFailed: 'Data backup failed: see Settings',
    unreachable: 'Folder unreachable, retrying…',
    wsMembers: 'Workspace members',
    lightTheme: 'Light theme (Ctrl+Shift+L)',
    darkTheme: 'Dark theme (Ctrl+Shift+L)',
  },
})

const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()
const showSettings = ref(false)
const showLabels = ref(false)
const showShortcuts = ref(false)

/** Stato delle copie per l'admin: una riga nel menu, che diventa un avviso se qualcosa non va. */
const backupLine = computed(() => {
  if (!ws.isAdmin || !ws.meta?.backup.enabled) return null
  const last = ws.backups.find((b) => b.reason === 'auto') ?? ws.backups[0]
  const days = last ? Math.floor((Date.now() - last.at.getTime()) / 86_400_000) : 0
  if (ws.backupError) return { label: m.backupFailed, icon: AlertTriangle, danger: true }
  if (last && days >= 3) return { label: m.backupOld(days), icon: AlertTriangle, danger: true }
  return { label: last ? m.backupLast(dayjs(last.at).fromNow()) : m.backupNone, icon: Archive, danger: false }
})

const menu = computed(() => [
  { label: m.settings, icon: Settings, onSelect: () => (showSettings.value = true) },
  { label: m.labels, icon: Tag, onSelect: () => (showLabels.value = true) },
  { label: m.members, icon: Users, onSelect: () => router.push({ name: 'members' }) },
  ...(ws.isAdmin
    ? [
        { label: m.analytics, icon: BarChart3, onSelect: () => router.push({ name: 'analytics' }) },
        { label: m.audit, icon: History, onSelect: () => router.push({ name: 'audit' }) },
      ]
    : []),
  { sep: true, label: '' },
  ...(backupLine.value ? [{ ...backupLine.value, onSelect: () => (showSettings.value = true) }] : []),
  { label: m.shortcuts, icon: Keyboard, onSelect: () => (showShortcuts.value = true) },
  { sep: true, label: '' },
  {
    label: m.closeWs,
    icon: LogOut,
    onSelect: async () => {
      await ws.close()
      router.push({ name: 'welcome' })
    },
  },
])

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable], [role=dialog]')) {
    e.preventDefault()
    showShortcuts.value = true
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
      <WifiOff :size="14" /> {{ m.unreachable }}
    </span>

    <GlobalSearch />

    <RouterLink
      :to="{ name: 'drive' }"
      class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
      active-class="bg-accent-soft text-accent-ink"
      title="Google Drive"
    >
      <Cloud :size="16" /> Drive
    </RouterLink>

    <RouterLink
      :to="{ name: 'github' }"
      class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
      active-class="bg-accent-soft text-accent-ink"
      title="GitHub"
    >
      <GitHubMark :size="15" /> GitHub
    </RouterLink>

    <RouterLink
      :to="{ name: 'members' }"
      class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
      active-class="bg-accent-soft text-accent-ink"
      :title="m.wsMembers"
    >
      <Users :size="16" />
      <span class="tabular-nums">{{ ws.users.length }}</span>
    </RouterLink>

    <NotificationsPanel />

    <button class="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" :title="ui.isDark ? m.lightTheme : m.darkTheme" @click="ui.toggleTheme()">
      <Sun v-if="ui.isDark" :size="16" />
      <Moon v-else :size="16" />
    </button>

    <button class="rounded-full" :title="m.settings" @click="showSettings = true">
      <UserAvatar :name="ws.currentUser?.displayName ?? '?'" size="md" />
    </button>

    <SettingsDialog v-model:open="showSettings" />
    <LabelsDialog v-model:open="showLabels" />
    <ShortcutsDialog v-model:open="showShortcuts" />
  </header>
</template>
