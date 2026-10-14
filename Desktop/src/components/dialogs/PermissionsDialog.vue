<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Shield } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { compareText, defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Gestione permessi',
    lead: 'Chi può vedere e modificare ciascun progetto. «Tutti» comprende anche chi entrerà nel workspace in futuro; chi non ha la spunta non vede il progetto, nemmeno nella barra laterale.',
    project: 'Progetto',
    filter: 'Progetto',
    allProjects: 'Tutti i progetti',
    everyone: 'Tutti',
    everyoneHint: 'Visibile a tutti i membri del workspace, anche futuri',
    canSee: (u: string, p: string) => `${u} può vedere «${p}»`,
    adminsSeeAll: 'Gli amministratori vedono sempre tutti i progetti.',
    noOthers: 'Nessun altro membro ancora: gli utenti compaiono qui dopo il primo accesso al workspace.',
    noProjects: 'Nessun progetto nel workspace.',
    onlyAdmins: 'solo amministratori',
    changed: (n: number) => (n ? `${n} ${plural(n, 'progetto modificato', 'progetti modificati')}` : 'Nessuna modifica'),
    saved: (n: number) => `Permessi aggiornati (${n} ${plural(n, 'progetto', 'progetti')})`,
  },
  en: {
    title: 'Manage permissions',
    lead: 'Who can see and edit each project. “Everyone” also includes whoever joins the workspace in the future; anyone without a tick cannot see the project, not even in the sidebar.',
    project: 'Project',
    filter: 'Project',
    allProjects: 'All projects',
    everyone: 'Everyone',
    everyoneHint: 'Visible to every workspace member, including future ones',
    canSee: (u: string, p: string) => `${u} can see “${p}”`,
    adminsSeeAll: 'Administrators always see every project.',
    noOthers: 'No other members yet: users appear here after their first access to the workspace.',
    noProjects: 'No projects in the workspace.',
    onlyAdmins: 'administrators only',
    changed: (n: number) => (n ? `${n} ${plural(n, 'project', 'projects')} changed` : 'No changes'),
    saved: (n: number) => `Permissions updated (${n} ${plural(n, 'project', 'projects')})`,
  },
})

/**
 * Permessi di visualizzazione dei progetti (workspace di rete, amministratori):
 * una riga per progetto, una colonna per utente; filtro per progetto.
 */
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()

/** Utenti con permessi da scegliere: gli amministratori vedono comunque tutto. */
const others = computed(() => ws.users.filter((u) => u.role !== 'admin').sort((a, b) => compareText(a.displayName, b.displayName)))
const adminIds = computed(() => ws.users.filter((u) => u.role === 'admin').map((u) => u.id))

/** Per progetto: visibile a tutti, oppure solo agli utenti scelti (non admin). */
type Access = { all: boolean; ids: string[] }
const draft = ref<Record<string, Access>>({})
const filter = ref('')

const original = (members: string[]): Access => ({ all: members.length === 0, ids: members.filter((id) => others.value.some((u) => u.id === id)) })
const key = (a: Access) => (a.all ? '*' : [...a.ids].sort().join(','))

watch(open, (o) => {
  if (!o) return
  draft.value = Object.fromEntries(ws.visibleProjects.map((p) => [p.id, original(p.members)]))
  filter.value = ''
})

const rows = computed(() => ws.visibleProjects.filter((p) => !filter.value || p.id === filter.value))
const changedIds = computed(() => ws.visibleProjects.filter((p) => draft.value[p.id] && key(draft.value[p.id]!) !== key(original(p.members))).map((p) => p.id))

const canSee = (pid: string, uid: string) => {
  const a = draft.value[pid]
  return !!a && (a.all || a.ids.includes(uid))
}
function toggle(pid: string, uid: string) {
  const a = draft.value[pid]
  if (!a) return
  // Da "tutti" a riservato: si parte da tutti gli utenti attuali, meno quello tolto
  if (a.all) draft.value[pid] = { all: false, ids: others.value.map((u) => u.id).filter((id) => id !== uid) }
  else draft.value[pid] = { all: false, ids: a.ids.includes(uid) ? a.ids.filter((id) => id !== uid) : [...a.ids, uid] }
}
function setEveryone(pid: string, on: boolean) {
  const a = draft.value[pid]
  if (!a) return
  draft.value[pid] = on ? { all: true, ids: a.ids } : { all: false, ids: others.value.map((u) => u.id) }
}

async function save() {
  const ids = changedIds.value
  for (const id of ids) {
    const a = draft.value[id]!
    // Con accesso riservato gli admin sono inclusi comunque (vedi ProjectAccessFields)
    await ws.updateProject(id, { members: a.all ? [] : [...new Set([...a.ids, ...adminIds.value])] })
  }
  open.value = false
  if (ids.length) ui.toast(m.saved(ids.length), 'success', undefined, 2500)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.lead" width="xl">
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <label class="text-[13px] font-semibold" for="perm-filter">{{ m.filter }}</label>
        <select id="perm-filter" v-model="filter" class="field field-sm w-72">
          <option value="">{{ m.allProjects }}</option>
          <option v-for="p in ws.visibleProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <span class="ml-auto flex items-center gap-1 text-[12px] text-ink-3"><Shield :size="12" /> {{ m.adminsSeeAll }}</span>
      </div>

      <p v-if="!others.length" class="rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{{ m.noOthers }}</p>
      <p v-else-if="!rows.length" class="text-[13px] text-ink-3">{{ m.noProjects }}</p>
      <div v-else class="max-h-[60vh] overflow-auto rounded-md border border-line">
        <table class="w-full border-collapse text-[13px]" data-permissions>
          <thead class="sticky top-0 z-10 bg-surface">
            <tr class="border-b border-line">
              <th class="sticky left-0 z-10 min-w-48 bg-surface px-3 py-2 text-left font-semibold">{{ m.project }}</th>
              <th class="px-2 py-2 text-center font-semibold" :title="m.everyoneHint">{{ m.everyone }}</th>
              <th v-for="u in others" :key="u.id" class="px-2 py-2 text-center font-medium" :title="`${u.username} · ${u.hostname}`">
                <span class="flex flex-col items-center gap-1">
                  <UserAvatar :name="u.displayName" size="xs" />
                  <span class="max-w-24 truncate text-[12px]">{{ u.displayName }}</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="p in rows" :key="p.id" class="hover:bg-surface-2" :data-project="p.name">
              <td class="sticky left-0 bg-surface px-3 py-1.5">
                <span class="font-semibold">{{ p.name }}</span>
                <span v-if="changedIds.includes(p.id)" class="ml-1.5 text-[11px] font-semibold text-p-alta">●</span>
                <span v-if="draft[p.id] && !draft[p.id]!.all && !draft[p.id]!.ids.length" class="ml-1.5 text-[11px] text-ink-3">({{ m.onlyAdmins }})</span>
              </td>
              <td class="px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  class="accent-accent"
                  :checked="draft[p.id]?.all"
                  :aria-label="`${m.everyone} · ${p.name}`"
                  @change="setEveryone(p.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td v-for="u in others" :key="u.id" class="px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  class="accent-accent"
                  :class="{ 'opacity-50': draft[p.id]?.all }"
                  :checked="canSee(p.id, u.id)"
                  :aria-label="m.canSee(u.displayName, p.name)"
                  @change="toggle(p.id, u.id)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer>
      <span class="mr-auto text-[12.5px]" :class="changedIds.length ? 'font-semibold text-p-alta' : 'text-ink-3'">{{ m.changed(changedIds.length) }}</span>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="!changedIds.length" @click="save">{{ common.actions.save }}</BaseButton>
    </template>
  </BaseDialog>
</template>
