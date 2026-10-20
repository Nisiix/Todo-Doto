<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    you: 'tu',
    working: (names: string, since: string) => `Ci sta lavorando: ${names} (da ${since})`,
  },
  en: {
    you: 'you',
    working: (names: string, since: string) => `Working on it: ${names} (for ${since})`,
  },
})

/**
 * Chi sta lavorando a un task, in una pastiglia di altezza fissa che sta
 * nella riga accanto al titolo: non cambia l'altezza della riga né sposta le
 * colonne (si stringe solo il titolo, che va già a capo con i puntini).
 * Al massimo due avatar, poi «+N».
 */
const props = defineProps<{ itemId: string }>()
const ws = useWorkspaceStore()

const entries = computed(() => ws.workingByItem[props.itemId] ?? [])
const shown = computed(() => entries.value.slice(0, 2))
const extra = computed(() => entries.value.length - shown.value.length)
const title = computed(() => {
  const me = ws.currentUser?.id
  const names = entries.value.map((e) => (e.user.id === me ? m.you : e.user.displayName)).join(', ')
  const oldest = entries.value.reduce((a, e) => (e.since < a ? e.since : a), entries.value[0]?.since ?? '')
  return m.working(names, dayjs(oldest).fromNow(true))
})
</script>

<template>
  <span
    v-if="entries.length"
    class="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-ok/50 bg-ok/10 pl-1.5 pr-0.5"
    :title="title"
    :aria-label="title"
    data-working-badge
  >
    <span class="h-1.5 w-1.5 rounded-full bg-ok motion-safe:animate-pulse" />
    <span class="flex -space-x-1">
      <UserAvatar v-for="e in shown" :key="e.user.id" :name="e.user.displayName" size="xs" class="!h-4 !w-4 !text-[8px] ring-1 ring-surface" />
    </span>
    <span v-if="extra > 0" class="pr-1 text-[10.5px] font-semibold tabular-nums text-ok">+{{ extra }}</span>
  </span>
</template>
