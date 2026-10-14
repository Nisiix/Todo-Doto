<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { AtSign, Bell, CheckCheck, CheckCircle2, CircleHelp, FilePlus2, MessageSquare, NotebookPen, Reply, Trash2, Waypoints } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import type { Notification, NotificationType } from '@/types'

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
}
const list = computed(() => notif.items.slice(0, 80))

function go(n: Notification) {
  notif.markRead(n.id)
  notif.open = false
  if (!ws.projects[n.projectId]) return
  router.push({ name: 'project', params: { id: n.projectId }, query: n.itemId ? { item: n.itemId } : {} })
  if (n.itemId) ui.selectedItemId = n.itemId
}
</script>

<template>
  <PopoverRoot v-model:open="notif.open">
    <PopoverTrigger as-child>
      <button class="relative rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2" title="Notifiche" aria-label="Notifiche">
        <Bell :size="16" />
        <span
          v-if="notif.unread"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-p-immediata px-1 text-[10px] font-bold text-white"
          aria-live="polite"
        >
          {{ notif.unread > 99 ? '99+' : notif.unread }}
        </span>
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent align="end" :side-offset="6" class="z-50 w-96 rounded-lg border border-line bg-surface shadow-[var(--shadow)] outline-none">
        <div class="flex items-center gap-2 border-b border-line px-3 py-2">
          <span class="flex-1 text-[13px] font-bold">Notifiche</span>
          <BaseButton v-if="notif.unread" size="sm" variant="ghost" @click="notif.markAllRead()"><CheckCheck :size="13" /> Segna tutte come lette</BaseButton>
          <BaseButton v-else-if="list.length" size="sm" variant="ghost" @click="notif.clear()">Svuota</BaseButton>
        </div>
        <ul v-if="list.length" class="max-h-[60vh] divide-y divide-line overflow-y-auto">
          <li v-for="n in list" :key="n.id">
            <button class="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-2" :class="{ 'bg-accent-soft/40': !n.read }" @click="go(n)">
              <component :is="ICON[n.type]" :size="15" class="mt-0.5 shrink-0" :class="n.type === 'mention' ? 'text-accent' : 'text-ink-3'" />
              <span class="min-w-0 flex-1">
                <span class="block text-[13px] leading-snug">
                  <span class="font-semibold">{{ ws.userName(n.byId) }}</span> {{ n.text }}
                </span>
                <span class="mt-0.5 block truncate text-[11.5px] text-ink-3">{{ n.projectName }} · {{ n.itemTitle }} · {{ dayjs(n.at).fromNow() }}</span>
              </span>
              <UserAvatar :name="ws.userName(n.byId)" size="xs" class="mt-0.5" />
            </button>
          </li>
        </ul>
        <p v-else class="px-3 py-6 text-center text-[13px] text-ink-3">Nessuna notifica. Qui compaiono le novità sui progetti di cui fai parte.</p>
        <p class="border-t border-line px-3 py-1.5 text-[11.5px] text-ink-3">Scegli cosa ricevere in Impostazioni → Notifiche.</p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
