<script lang="ts">
import type { User, Visibility } from '@/types'

/** Utenti da salvare in un progetto limitato: solo quelli scelti fra i non amministratori (gli admin vedono comunque tutto). */
export function resolveMembers(users: User[], visibility: Visibility, members: string[]): string[] {
  if (visibility === 'public') return []
  return members.filter((id) => users.some((u) => u.id === id && u.role !== 'admin'))
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { Shield } from 'lucide-vue-next'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    visibility: 'Visibilità',
    public: 'Pubblica',
    restricted: 'Limitata',
    publicHint: 'Visibile a tutti i membri del workspace, anche a chi entrerà in futuro.',
    restrictedHint: 'Visibile solo agli utenti scelti (gli amministratori vedono sempre tutto). Potrai cambiarli anche dopo, da Membri › Gestione permessi.',
    userOn: (u: string, h: string) => `${u} su ${h}`,
    noOthers: 'Nessun altro membro ancora: per ora lo vedono solo gli amministratori.',
    onlyAdmins: 'Nessun utente scelto: per ora lo vedono solo gli amministratori.',
  },
  en: {
    visibility: 'Visibility',
    public: 'Public',
    restricted: 'Restricted',
    publicHint: 'Visible to every workspace member, including whoever joins in the future.',
    restrictedHint: 'Visible only to the chosen users (administrators always see everything). You can change them later in Members › Manage permissions.',
    userOn: (u: string, h: string) => `${u} on ${h}`,
    noOthers: 'No other members yet: for now only administrators can see it.',
    onlyAdmins: 'No user chosen: for now only administrators can see it.',
  },
})

/** Visibilità del progetto (pubblica o limitata) e, se limitata, gli utenti che lo vedono. */
const visibility = defineModel<Visibility>('visibility', { required: true })
const members = defineModel<string[]>('members', { required: true })
const ws = useWorkspaceStore()

const others = computed(() => ws.users.filter((u) => u.role !== 'admin'))
const chosen = computed(() => members.value.filter((id) => others.value.some((u) => u.id === id)).length)
function toggleMember(id: string) {
  members.value = members.value.includes(id) ? members.value.filter((x) => x !== id) : [...members.value, id]
}
</script>

<template>
  <div data-visibility-fields>
    <span class="label">{{ m.visibility }}</span>
    <SegmentedControl
      v-model="visibility"
      :options="[
        { value: 'public', label: m.public },
        { value: 'restricted', label: m.restricted },
      ]"
    />
    <p class="mt-1.5 flex items-start gap-1.5 text-[12px] text-ink-3">
      <span class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" :class="visibility === 'restricted' ? 'bg-p-alta' : 'bg-ok'" />
      {{ visibility === 'restricted' ? m.restrictedHint : m.publicHint }}
    </p>
    <div v-if="visibility === 'restricted'" class="mt-2 rounded-md border border-line">
      <ul v-if="others.length" class="max-h-44 divide-y divide-line overflow-y-auto">
        <li v-for="u in others" :key="u.id">
          <label class="flex items-center gap-2 px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
            <input type="checkbox" class="accent-accent" :checked="members.includes(u.id)" @change="toggleMember(u.id)" />
            <UserAvatar :name="u.displayName" size="xs" />
            <span class="flex-1">{{ u.displayName }}</span>
            <span class="text-[11.5px] text-ink-3">{{ m.userOn(u.username, u.hostname) }}</span>
          </label>
        </li>
      </ul>
      <p v-if="!others.length || !chosen" class="flex items-center gap-1.5 border-t border-line px-2 py-1.5 text-[12px] text-ink-3 first:border-t-0">
        <Shield :size="11" class="shrink-0" />
        {{ !others.length ? m.noOthers : !chosen ? m.onlyAdmins : '' }}
      </p>
    </div>
  </div>
</template>
