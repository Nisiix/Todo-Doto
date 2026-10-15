<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { AtSign, Bell, CheckCheck, UserCheck, CheckCircle2, CircleHelp, FilePlus2, MessageSquare, NotebookPen, Reply, Trash2, Waypoints, Wrench, X } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { sectionParam } from '@/services/sections'
import type { Notification, NotificationType } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Notifiche',
    markAllRead: 'Segna tutte come lette',
    clearAll: 'Elimina tutte',
    remove: 'Elimina notifica',
    empty: 'Nessuna notifica. Qui compaiono le novità sui progetti di cui fai parte.',
    hint: 'Una volta viste non sono più nuove. Scegli cosa ricevere in Impostazioni → Notifiche.',
    app: 'Todo Doto',
  },
  en: {
    title: 'Notifications',
    markAllRead: 'Mark all as read',
    clearAll: 'Delete all',
    remove: 'Delete notification',
    empty: 'No notifications. Updates on the projects you belong to appear here.',
    hint: 'Once seen they are no longer new. Choose what to receive in Settings → Notifications.',
    app: 'Todo Doto',
  },
})

/**
 * Pannello delle notifiche. Le nuove restano evidenziate finché il pannello è
 * aperto; alla chiusura diventano lette e non tornano più "nuove" (la stessa
 * notizia non viene nemmeno ricreata: vedi le chiavi nello store).
 */
const notif = useNotificationsStore()
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()

const ICON: Record<NotificationType, unknown> = {
  item_created: FilePlus2,
  item_status: Waypoints,
  item_completed: CheckCircle2,
  item_trashed: Trash2,
  item_notes: NotebookPen,
  question: CircleHelp,
  answer: Reply,
  comment: MessageSquare,
  mention: AtSign,
  assigned: UserCheck,
  setup_incomplete: Wrench,
}
const list = computed(() => notif.items.slice(0, 80))
const isSystem = (n: Notification) => !n.byId

// Viste = lette: quando il pannello si chiude, le notifiche mostrate non sono più nuove
watch(
  () => notif.open,
  (o, was) => {
    if (!o && was && notif.unread) notif.markAllRead()
  },
)

function go(n: Notification) {
  notif.markRead(n.id)
  notif.open = false
  if (!ws.projects[n.projectId]) return
  if (n.type === 'setup_incomplete') {
    router.push({ name: 'project', params: { id: n.projectId, section: sectionParam('stack') } })
    return
  }
  router.push({ name: 'project', params: { id: n.projectId }, query: n.itemId ? { item: n.itemId } : {} })
  if (n.itemId) ui.selectedItemId = n.itemId
}
</script>

<template>
  <PopoverRoot v-model:open="notif.open">
    <PopoverTrigger as-child>
      <button class="relative rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2" :title="m.title" :aria-label="m.title">
        <Bell :size="16" />
        <span
          v-if="notif.unread"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-p-immediata px-1 text-[10px] font-bold text-white"
          aria-live="polite"
          data-unread
        >
          {{ notif.unread > 99 ? '99+' : notif.unread }}
        </span>
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent align="end" :side-offset="6" class="z-50 w-96 rounded-lg border border-line bg-surface shadow-[var(--shadow)] outline-none" :aria-label="m.title">
        <div class="flex items-center gap-1 border-b border-line px-3 py-2">
          <span class="flex-1 text-[13px] font-bold">{{ m.title }}</span>
          <BaseButton v-if="notif.unread" size="sm" variant="ghost" @click="notif.markAllRead()"><CheckCheck :size="13" /> {{ m.markAllRead }}</BaseButton>
          <BaseButton v-if="list.length" size="sm" variant="ghost" class="text-danger" @click="notif.clear()"><Trash2 :size="13" /> {{ m.clearAll }}</BaseButton>
        </div>
        <ul v-if="list.length" class="max-h-[60vh] divide-y divide-line overflow-y-auto">
          <li v-for="n in list" :key="n.id" class="group relative" :data-notification="n.type" :data-unread="!n.read || undefined">
            <button class="flex w-full items-start gap-2.5 py-2 pl-3 pr-9 text-left hover:bg-surface-2" :class="{ 'bg-accent-soft/40': !n.read }" @click="go(n)">
              <component :is="ICON[n.type]" :size="15" class="mt-0.5 shrink-0" :class="n.type === 'mention' ? 'text-accent' : n.type === 'setup_incomplete' ? 'text-danger' : 'text-ink-3'" />
              <span class="min-w-0 flex-1">
                <span class="block text-[13px] leading-snug">
                  <template v-if="isSystem(n)">{{ n.text }}</template>
                  <template v-else><span class="font-semibold">{{ ws.userName(n.byId) }}</span> {{ n.text }}</template>
                </span>
                <span class="mt-0.5 block truncate text-[11.5px] text-ink-3">{{ n.projectName }}<template v-if="n.itemTitle"> · {{ n.itemTitle }}</template> · {{ dayjs(n.at).fromNow() }}</span>
              </span>
              <UserAvatar v-if="!isSystem(n)" :name="ws.userName(n.byId)" size="xs" class="mt-0.5" />
            </button>
            <button
              class="absolute right-2 top-2 rounded p-1 text-ink-3 opacity-0 hover:bg-surface-3 hover:text-ink focus:opacity-100 group-hover:opacity-100"
              :title="m.remove"
              :aria-label="m.remove"
              @click="notif.remove(n.id)"
            >
              <X :size="13" />
            </button>
          </li>
        </ul>
        <p v-else class="px-3 py-6 text-center text-[13px] text-ink-3">{{ m.empty }}</p>
        <p class="border-t border-line px-3 py-1.5 text-[11.5px] text-ink-3">{{ m.hint }}</p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
