<script setup lang="ts">
import { t, tn } from '@/i18n'
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Eraser, Shield, ShieldOff, UserX } from 'lucide-vue-next'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { ROLE_LABEL, type Role, type User } from '@/types'
import { seatHolders as seatHoldersOf, seatsLabel } from '@/services/license'

const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

const RANK: Record<Role, number> = { admin: 0, cleaner: 1, member: 2 }
const seatHolders = computed(() => seatHoldersOf(ws.users, ws.plan.seats))
const sorted = computed(() => [...ws.users].sort((a, b) => RANK[a.role] - RANK[b.role] || a.displayName.localeCompare(b.displayName, 'it')))
const projectsOf = (u: User) => Object.values(ws.projects).filter((p) => p.members.includes(u.id)).length

async function remove(u: User) {
  const ok = await confirm({
    title: t('Rimuovere {name} dal workspace?', { name: u.displayName }),
    message: t('Verrà tolto anche dai progetti a cui partecipa. Potrà rientrare reinserendo la password.'),
    confirmLabel: t('Rimuovi'),
    danger: true,
  })
  if (ok) await ws.removeUser(u.id)
}
const menu = (u: User) => [
  ...(u.role !== 'admin' ? [{ label: t('Rendi amministratore'), icon: Shield, onSelect: () => ws.setUserRole(u.id, 'admin') }] : []),
  ...(u.role !== 'cleaner' ? [{ label: ws.can('cleanerRole') ? 'Rendi Cleaner' : 'Rendi Cleaner (piano Team)', icon: Eraser, onSelect: () => ws.setUserRole(u.id, 'cleaner') }] : []),
  ...(u.role !== 'member' ? [{ label: t('Rendi membro'), icon: ShieldOff, onSelect: () => ws.setUserRole(u.id, 'member') }] : []),
  { sep: true, label: '' },
  { label: t('Rimuovi dal workspace'), icon: UserX, danger: true, onSelect: () => remove(u) },
]
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8">
    <h1 class="text-[24px] font-extrabold tracking-tight">{{ t('Membri') }}</h1>
    <p class="mt-1 max-w-xl text-[13.5px] leading-relaxed text-ink-2">
      <template v-if="ws.isNetwork">
        {{ t('Chi apre questa cartella di rete e inserisce la password compare qui. Gli amministratori gestiscono password, ruoli e chi partecipa a ciascun progetto. I') }} <b>{{ t('Cleaner') }}</b> {{ t('possono, come gli amministratori, eliminare definitivamente elementi e progetti dal cestino; i membri possono solo cestinare e ripristinare.') }}
      </template>
      <template v-else>{{ t('Workspace locale: sei l\'unico utente. Per lavorare con i colleghi crea un workspace condiviso in rete.') }}</template>
    </p>
    <p v-if="ws.isNetwork" class="mt-2 text-[12.5px] text-ink-3">
      {{ t('Piano') }} {{ ws.plan.plan === 'free' ? 'Free' : ws.plan.plan === 'team' ? 'Team' : 'Business' }}: {{ tn(ws.users.length, '1 membro', '{n} membri') }}, {{ seatsLabel(ws.plan.seats) }}.
      <button class="font-semibold text-accent-ink hover:underline" @click="ui.showLicense = true">{{ t('Piano e licenza') }}</button>
    </p>

    <ul class="mt-6 max-w-3xl divide-y divide-line">
      <li v-for="u in sorted" :key="u.id" class="group flex items-center gap-3 py-3">
        <UserAvatar :name="u.displayName" size="md" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ u.displayName }}</span>
            <span v-if="u.id === ws.currentUser?.id" class="text-[12px] text-ink-3">{{ t('(tu)') }}</span>
            <span v-if="ws.isNetwork && ws.overSeats && !ws.plan.trialActive && !seatHolders.has(u.id)" class="rounded-full bg-danger/10 px-1.5 py-px text-[11px] font-semibold text-danger" :title="t('Oltre i posti del piano: lavora in sola lettura')">{{ t('sola lettura') }}</span>
            <span v-if="u.role === 'admin'" class="flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-ink"><Shield :size="11" /> {{ ROLE_LABEL.admin }}</span>
            <span v-else-if="u.role === 'cleaner'" class="flex items-center gap-1 rounded-full bg-p-media/20 px-1.5 py-px text-[11px] font-semibold text-ink-2" :title="t('Può eliminare definitivamente elementi e progetti dal cestino')"><Eraser :size="11" /> {{ ROLE_LABEL.cleaner }}</span>
          </div>
          <span class="block text-[12px] text-ink-3">{{ t('{user} su {host}', { user: u.username, host: u.hostname }) }} · {{ t('dal') }} {{ dayjs(u.createdAt).format('D MMM YYYY') }}</span>
        </div>
        <span class="text-[12px] tabular-nums text-ink-3">{{ projectsOf(u) ? t('{n} progetti riservati', { n: projectsOf(u) }) : '' }}</span>
        <BaseMenu v-if="ws.isAdmin && u.id !== ws.currentUser?.id" :items="menu(u)">
          <MenuTriggerButton :size="16" />
        </BaseMenu>
      </li>
    </ul>
  </div>
</template>
