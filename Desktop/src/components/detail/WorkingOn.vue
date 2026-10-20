<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { Hammer } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { firstLine } from '@/services/items'
import type { Item, Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    start: 'Ci sto lavorando',
    startHint: 'I colleghi vedono che ci stai lavorando, nella lista e in «Chi lavora a cosa». Puoi lavorare a un task per volta.',
    switchHint: (t: string) => `Ora stai lavorando a «${t}»: l'indicazione si sposta qui.`,
    mine: (since: string) => `Ci stai lavorando da ${since}`,
    stop: 'Ho smesso',
    others: (since: string) => `ci lavora da ${since}`,
  },
  en: {
    start: "I'm working on it",
    startHint: 'Your colleagues see you are working on it, in the list and in “Who’s working on what”. One task at a time.',
    switchHint: (t: string) => `You are working on “${t}”: the indicator moves here.`,
    mine: (since: string) => `You've been working on it for ${since}`,
    stop: "I've stopped",
    others: (since: string) => `working on it for ${since}`,
  },
})

/**
 * «Ci sto lavorando» nel dettaglio del task (solo workspace di rete): un
 * pulsante per dirlo, chi altro ci lavora e da quanto. Si toglie da solo
 * quando il task viene completato o cestinato, o chiudendo l'app.
 */
const props = defineProps<{ project: Project; item: Item }>()
const ws = useWorkspaceStore()
const busy = ref(false)

const entries = computed(() => ws.workingByItem[props.item.id] ?? [])
const mine = computed(() => entries.value.find((e) => e.user.id === ws.currentUser?.id) ?? null)
const others = computed(() => entries.value.filter((e) => e.user.id !== ws.currentUser?.id))
/** Il task a cui si sta lavorando ora, se è un altro. */
const elsewhere = computed(() => ws.workingEntries.find((e) => e.user.id === ws.currentUser?.id && e.item.id !== props.item.id) ?? null)
const since = (iso: string) => dayjs(iso).fromNow(true)

async function toggle(on: boolean) {
  busy.value = true
  try {
    await ws.setWorkingOn(on ? { projectId: props.project.id, itemId: props.item.id } : null)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="ws.isNetwork && item.bucket === 'todo'" class="rounded-lg border border-line px-3 py-2" data-working-on>
    <div class="flex items-center gap-2">
      <template v-if="mine">
        <span class="h-2 w-2 shrink-0 rounded-full bg-ok motion-safe:animate-pulse" />
        <span class="flex-1 text-[12.5px] font-medium text-ok" data-working-mine>{{ m.mine(since(mine.since)) }}</span>
        <BaseButton size="sm" variant="ghost" :disabled="busy" data-working-stop @click="toggle(false)">{{ m.stop }}</BaseButton>
      </template>
      <template v-else>
        <BaseButton size="sm" variant="outline" :disabled="busy" :title="m.startHint" data-working-start @click="toggle(true)">
          <Hammer :size="13" /> {{ m.start }}
        </BaseButton>
        <span v-if="elsewhere" class="min-w-0 flex-1 truncate text-[11.5px] text-ink-3" :title="m.switchHint(firstLine(elsewhere.item.title))">
          {{ m.switchHint(firstLine(elsewhere.item.title)) }}
        </span>
      </template>
    </div>
    <ul v-if="others.length" class="mt-2 space-y-1">
      <li v-for="e in others" :key="e.user.id" class="flex items-center gap-2 text-[12px] text-ink-2" data-working-other>
        <UserAvatar :name="e.user.displayName" size="xs" />
        <span class="font-medium">{{ e.user.displayName }}</span>
        <span class="text-ink-3">{{ m.others(since(e.since)) }}</span>
      </li>
    </ul>
  </div>
</template>
