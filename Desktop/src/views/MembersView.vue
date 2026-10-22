<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { Eraser, HardDrive, KeyRound, Shield, ShieldOff, UserX } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import AvailabilityDialog from '@/components/dialogs/AvailabilityDialog.vue'
import { absenceOn } from '@/services/load'
import { formatDue } from '@/services/items'
import { useToday } from '@/composables/useToday'
import PermissionsDialog from '@/components/dialogs/PermissionsDialog.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { accountLabel } from '@/services/domain'
import { useConfirm } from '@/composables/useConfirm'
import { useSharing } from '@/composables/useSharing'
import { projectVisibility, ROLE_LABEL, type Role, type User } from '@/types'
import { compareText, DATE, defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    removeTitle: (n: string) => `Rimuovere ${n} dal workspace?`,
    removeMessage: 'Verrà tolto anche dai progetti a cui partecipa. Potrà rientrare reinserendo la password.',
    makeAdmin: 'Rendi amministratore',
    makeCleaner: 'Rendi Cleaner',
    makeMember: 'Rendi membro',
    removeFromWs: 'Rimuovi dal workspace',
    availability: 'Disponibilità',
    availabilityHint: 'Ore a settimana e assenze',
    absentNow: (to: string) => `assente fino al ${to}`,
    absentNext: (from: string, to: string) => `assente dal ${from} al ${to}`,
    title: 'Membri',
    networkLead1:
      'Chi apre questa cartella di rete e inserisce la password compare qui. Gli amministratori gestiscono password, ruoli e chi partecipa a ciascun progetto. Un elemento da fare può essere cestinato da chi ne è assegnatario, dai',
    networkLead2: 'e dagli amministratori; l’eliminazione definitiva di elementi e progetti spetta solo agli amministratori.',
    localLead: 'Workspace locale: sei l’unico utente. Per lavorare con i colleghi crea un workspace condiviso in rete.',
    cleanerHint: 'Può spostare nel cestino qualsiasi elemento, anche non assegnato a lui',
    userSince: (u: string, h: string, d: string) => `${u} su ${h} · dal ${d}`,
    domainSince: (acc: string, d: string) => `Account di dominio ${acc} · dal ${d}`,
    restricted: (n: number) => `${n} ${plural(n, 'progetto riservato', 'progetti riservati')}`,
    permissions: 'Gestione permessi',
    permissionsHint: 'Chi può vedere ciascun progetto, utente per utente',
  },
  en: {
    removeTitle: (n: string) => `Remove ${n} from the workspace?`,
    removeMessage: 'They will also be removed from the projects they take part in. They can come back by entering the password again.',
    makeAdmin: 'Make administrator',
    makeCleaner: 'Make Cleaner',
    makeMember: 'Make member',
    removeFromWs: 'Remove from workspace',
    availability: 'Availability',
    availabilityHint: 'Hours per week and absences',
    absentNow: (to: string) => `away until ${to}`,
    absentNext: (from: string, to: string) => `away from ${from} to ${to}`,
    title: 'Members',
    networkLead1:
      'Whoever opens this network folder and enters the password appears here. Administrators manage the password, roles and who takes part in each project. A to-do item can be trashed by its assignee, by',
    networkLead2: 'users and by administrators; permanently deleting items and projects is reserved to administrators.',
    localLead: 'Local workspace: you are the only user. To work with colleagues, create a workspace shared on the network.',
    cleanerHint: 'Can move any item to the trash, even when not assigned to them',
    userSince: (u: string, h: string, d: string) => `${u} on ${h} · since ${d}`,
    domainSince: (acc: string, d: string) => `Domain account ${acc} · since ${d}`,
    restricted: (n: number) => `${n} restricted ${plural(n, 'project', 'projects')}`,
    permissions: 'Manage permissions',
    permissionsHint: 'Who can see each project, user by user',
  },
})

const ws = useWorkspaceStore()
/** Workspace di rete con la cartella Dati in locale: non si condivide. */
const sharing = useSharing()
const confirm = useConfirm()
const showPermissions = ref(false)
/** Progetto da mostrare subito nella gestione permessi (?permissions=<id>, dal menu della visibilità). */
const permissionsProject = ref<string | null>(null)
const route = useRoute()
const router = useRouter()
watch(
  () => route.query.permissions,
  (id) => {
    if (typeof id !== 'string' || !ws.isAdmin) return
    permissionsProject.value = id
    showPermissions.value = true
    void router.replace({ query: {} })
  },
  { immediate: true },
)
function openPermissions() {
  permissionsProject.value = null
  showPermissions.value = true
}

// Disponibilità (ore e assenze): la persona stessa o un amministratore
const availabilityFor = ref<string | null>(null)
const showAvailability = ref(false)
function openAvailability(u: User) {
  availabilityFor.value = u.id
  showAvailability.value = true
}
const { today } = useToday()
/** Assenza in corso o la prossima entro 30 giorni. */
function absenceText(u: User) {
  const now = absenceOn(u.absences, today.value)
  if (now) return m.absentNow(formatDue(now.to))
  const limit = new Date(Date.parse(today.value) + 30 * 86_400_000).toISOString().slice(0, 10)
  const next = u.absences.find((a) => a.from > today.value && a.from <= limit)
  return next ? m.absentNext(formatDue(next.from), formatDue(next.to)) : ''
}

const RANK: Record<Role, number> = { admin: 0, cleaner: 1, member: 2 }
const sorted = computed(() => [...ws.users].sort((a, b) => RANK[a.role] - RANK[b.role] || compareText(a.displayName, b.displayName)))
/** Progetti limitati che l'utente vede (quelli pubblici li vedono tutti). */
const projectsOf = (u: User) => Object.values(ws.projects).filter((p) => projectVisibility(p) === 'restricted' && p.members.includes(u.id)).length

async function remove(u: User) {
  const ok = await confirm({
    title: m.removeTitle(u.displayName),
    message: m.removeMessage,
    confirmLabel: common.actions.remove,
    danger: true,
  })
  if (ok) await ws.removeUser(u.id)
}
const menu = (u: User) => [
  ...(u.role !== 'admin' ? [{ label: m.makeAdmin, icon: Shield, onSelect: () => ws.setUserRole(u.id, 'admin') }] : []),
  ...(u.role !== 'cleaner' ? [{ label: m.makeCleaner, icon: Eraser, onSelect: () => ws.setUserRole(u.id, 'cleaner') }] : []),
  ...(u.role !== 'member' ? [{ label: m.makeMember, icon: ShieldOff, onSelect: () => ws.setUserRole(u.id, 'member') }] : []),
  { sep: true, label: '' },
  { label: m.removeFromWs, icon: UserX, danger: true, onSelect: () => remove(u) },
]
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8">
    <div class="flex max-w-3xl items-center gap-3">
      <h1 class="flex-1 text-[24px] font-extrabold tracking-tight">{{ m.title }}</h1>
      <BaseButton v-if="ws.isAdmin && ws.isNetwork" size="sm" :title="m.permissionsHint" @click="openPermissions"><KeyRound :size="14" /> {{ m.permissions }}</BaseButton>
    </div>
    <p class="mt-1 max-w-xl text-[13.5px] leading-relaxed text-ink-2">
      <template v-if="ws.isNetwork">
        {{ m.networkLead1 }} <b>Cleaner</b> {{ m.networkLead2 }}
      </template>
      <template v-else>{{ m.localLead }}</template>
    </p>
    <p v-if="sharing.workspaceText.value" class="mt-3 flex max-w-xl items-start gap-1.5 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2" data-share-blocked>
      <HardDrive :size="14" class="mt-0.5 shrink-0 text-p-alta" /> {{ sharing.workspaceText.value }}
    </p>

    <ul class="mt-6 max-w-3xl divide-y divide-line">
      <li v-for="u in sorted" :key="u.id" class="group flex items-center gap-3 py-3">
        <UserAvatar :name="u.displayName" size="md" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ u.displayName }}</span>
            <span v-if="u.id === ws.currentUser?.id" class="text-[12px] text-ink-3">({{ common.you }})</span>
            <span v-if="u.role === 'admin'" class="flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-ink"><Shield :size="11" /> {{ ROLE_LABEL.admin }}</span>
            <span v-else-if="u.role === 'cleaner'" class="flex items-center gap-1 rounded-full bg-p-media/20 px-1.5 py-px text-[11px] font-semibold text-ink-2" :title="m.cleanerHint"><Eraser :size="11" /> {{ ROLE_LABEL.cleaner }}</span>
          </div>
          <span class="block text-[12px] text-ink-3">{{ u.sid && u.domain ? m.domainSince(accountLabel(u), dayjs(u.createdAt).format(DATE.date)) : m.userSince(u.username, u.hostname, dayjs(u.createdAt).format(DATE.date)) }}</span>
        </div>
        <span v-if="absenceText(u)" class="rounded-full bg-p-media/15 px-2 text-[11.5px] font-medium text-ink-2" data-member-absence>{{ absenceText(u) }}</span>
        <span class="text-[12px] tabular-nums text-ink-3">{{ projectsOf(u) ? m.restricted(projectsOf(u)) : '' }}</span>
        <BaseButton v-if="ws.isAdmin || u.id === ws.currentUser?.id" size="sm" variant="ghost" :title="m.availabilityHint" data-availability-open @click="openAvailability(u)">{{ m.availability }}</BaseButton>
        <BaseMenu v-if="ws.isAdmin && u.id !== ws.currentUser?.id" :items="menu(u)">
          <MenuTriggerButton :size="16" />
        </BaseMenu>
      </li>
    </ul>
    <PermissionsDialog v-model:open="showPermissions" :project-id="permissionsProject" />
    <AvailabilityDialog v-model:open="showAvailability" :user-id="availabilityFor" />
  </div>
</template>
