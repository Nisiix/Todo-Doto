<script lang="ts">
import type { User } from '@/types'

export type ProjectAccess = 'all' | 'restricted'

/**
 * Membri da salvare nel progetto: vuoto = tutti; con accesso riservato gli
 * admin sono inclusi comunque, così il file resta coerente anche se più avanti
 * un admin viene retrocesso a membro. `null` se l'accesso è riservato ma non è
 * stata scelta nessuna persona (e ce ne sono).
 */
export function resolveMembers(users: User[], access: ProjectAccess, members: string[]): string[] | null {
  if (access === 'all') return []
  const others = users.filter((u) => u.role !== 'admin')
  const chosen = members.filter((id) => others.some((u) => u.id === id))
  if (!chosen.length && others.length) return null
  return [...new Set([...chosen, ...users.filter((u) => u.role === 'admin').map((u) => u.id)])]
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { Shield } from 'lucide-vue-next'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    whoCanSee: 'Chi può vedere e modificare il progetto',
    all: 'Tutti i membri del workspace',
    restricted: 'Solo alcune persone',
    adminsSeeAll: 'Gli amministratori vedono sempre tutti i progetti',
    userOn: (u: string, h: string) => `${u} su ${h}`,
    noOthers: 'Nessun altro membro ancora: gli utenti compaiono qui dopo il primo accesso al workspace.',
    selected: (n: number) => `${n} ${n === 1 ? 'persona scelta' : 'persone scelte'}. Chi non è nella lista non vede il progetto, nemmeno nella barra laterale.`,
    visibleAll: 'Visibile a chiunque apra questo workspace con la password.',
  },
  en: {
    whoCanSee: 'Who can see and edit the project',
    all: 'All workspace members',
    restricted: 'Only some people',
    adminsSeeAll: 'Administrators always see every project',
    userOn: (u: string, h: string) => `${u} on ${h}`,
    noOthers: 'No other members yet: users appear here after their first access to the workspace.',
    selected: (n: number) => `${n} ${n === 1 ? 'person selected' : 'people selected'}. Anyone not on the list cannot see the project, not even in the sidebar.`,
    visibleAll: 'Visible to anyone who opens this workspace with the password.',
  },
})

/** Chi può vedere il progetto (workspace di rete): tutti, oppure solo le persone scelte. */
const access = defineModel<ProjectAccess>('access', { required: true })
const members = defineModel<string[]>('members', { required: true })
const ws = useWorkspaceStore()

/** Gli admin vedono sempre tutto: nella lista sono mostrati ma non selezionabili. */
const admins = computed(() => ws.users.filter((u) => u.role === 'admin'))
const others = computed(() => ws.users.filter((u) => u.role !== 'admin'))
const selectedCount = computed(() => members.value.filter((id) => others.value.some((u) => u.id === id)).length)
function toggleMember(id: string) {
  members.value = members.value.includes(id) ? members.value.filter((x) => x !== id) : [...members.value, id]
}
</script>

<template>
  <div>
    <span class="label">{{ m.whoCanSee }}</span>
    <SegmentedControl
      v-model="access"
      :options="[
        { value: 'all', label: m.all },
        { value: 'restricted', label: m.restricted },
      ]"
    />
    <div v-if="access === 'restricted'" class="mt-2 rounded-md border border-line">
      <ul class="max-h-44 divide-y divide-line overflow-y-auto">
        <li v-for="u in admins" :key="u.id" class="flex items-center gap-2 px-2 py-1.5 text-[13.5px] text-ink-2">
          <input type="checkbox" class="accent-accent" checked disabled />
          <UserAvatar :name="u.displayName" size="xs" />
          <span class="flex-1">{{ u.displayName }}<span v-if="u.id === ws.currentUser?.id"> ({{ common.you }})</span></span>
          <span class="flex items-center gap-1 text-[11.5px] text-ink-3" :title="m.adminsSeeAll"><Shield :size="11" /> admin</span>
        </li>
        <li v-for="u in others" :key="u.id">
          <label class="flex items-center gap-2 px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
            <input type="checkbox" class="accent-accent" :checked="members.includes(u.id)" @change="toggleMember(u.id)" />
            <UserAvatar :name="u.displayName" size="xs" />
            <span class="flex-1">{{ u.displayName }}</span>
            <span class="text-[11.5px] text-ink-3">{{ m.userOn(u.username, u.hostname) }}</span>
          </label>
        </li>
      </ul>
      <p class="border-t border-line px-2 py-1.5 text-[12px] text-ink-3">
        <template v-if="others.length === 0">{{ m.noOthers }}</template>
        <template v-else>{{ m.selected(selectedCount) }}</template>
      </p>
    </div>
    <p v-else class="mt-1.5 text-[12px] text-ink-3">{{ m.visibleAll }}</p>
  </div>
</template>
