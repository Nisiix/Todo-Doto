<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { HardDrive, Shield } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import VisibilityDot from '@/components/ui/VisibilityDot.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useSharing } from '@/composables/useSharing'
import { projectVisibility } from '@/types'
import { compareText, defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Gestione permessi',
    lead: 'Chi può vedere e modificare i progetti a visibilità limitata (pallino arancione). I progetti pubblici (pallino verde) sono sempre visibili a tutti e non compaiono qui: la visibilità si cambia dall’intestazione del progetto.',
    project: 'Progetto',
    filter: 'Progetto',
    allProjects: 'Tutti i progetti limitati',
    canSee: (u: string, p: string) => `${u} può vedere «${p}»`,
    adminsSeeAll: 'Gli amministratori vedono sempre tutti i progetti.',
    noOthers: 'Nessun altro membro ancora: gli utenti compaiono qui dopo il primo accesso al workspace.',
    noRestricted: 'Nessun progetto a visibilità limitata: tutti i progetti sono pubblici. Per limitarne uno, scegli «Limitata» nella sua intestazione.',
    publicCount: (n: number) => `${n} ${plural(n, 'progetto pubblico', 'progetti pubblici')}, visibili a tutti`,
    onlyAdmins: 'solo amministratori',
    local: 'in locale: non condivisibile',
    changed: (n: number) => (n ? `${n} ${plural(n, 'progetto modificato', 'progetti modificati')}` : 'Nessuna modifica'),
    saved: (n: number) => `Permessi aggiornati (${n} ${plural(n, 'progetto', 'progetti')})`,
  },
  en: {
    title: 'Manage permissions',
    lead: 'Who can see and edit the projects with restricted visibility (orange dot). Public projects (green dot) are always visible to everyone and are not listed here: visibility is changed from the project header.',
    project: 'Project',
    filter: 'Project',
    allProjects: 'All restricted projects',
    canSee: (u: string, p: string) => `${u} can see “${p}”`,
    adminsSeeAll: 'Administrators always see every project.',
    noOthers: 'No other members yet: users appear here after their first access to the workspace.',
    noRestricted: 'No project with restricted visibility: every project is public. To restrict one, choose “Restricted” in its header.',
    publicCount: (n: number) => `${n} public ${plural(n, 'project', 'projects')}, visible to everyone`,
    onlyAdmins: 'administrators only',
    local: 'local: cannot be shared',
    changed: (n: number) => (n ? `${n} ${plural(n, 'project', 'projects')} changed` : 'No changes'),
    saved: (n: number) => `Permissions updated (${n} ${plural(n, 'project', 'projects')})`,
  },
})

/**
 * Permessi dei progetti a visibilità limitata (workspace di rete, amministratori):
 * una riga per progetto, una colonna per utente; filtro per progetto.
 * `projectId`: progetto da mostrare subito (es. dal menu della visibilità).
 */
const props = defineProps<{ projectId?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
/** Progetti in locale (cartella Dati o cartella del progetto): non si scelgono utenti. */
const sharing = useSharing()
const blockedText = (p: Parameters<typeof sharing.projectText>[0]) => sharing.projectText(p)
const ui = useUiStore()

/** Utenti con permessi da scegliere: gli amministratori vedono comunque tutto. */
const others = computed(() => ws.users.filter((u) => u.role !== 'admin').sort((a, b) => compareText(a.displayName, b.displayName)))
/** Solo i progetti limitati: quelli pubblici sono visibili a tutti e non si selezionano. */
const restricted = computed(() => ws.visibleProjects.filter((p) => projectVisibility(p) === 'restricted'))
const publicCount = computed(() => ws.visibleProjects.length - restricted.value.length)

/** Per progetto: utenti (non admin) che lo vedono. */
const draft = ref<Record<string, string[]>>({})
const filter = ref('')
const original = (members: string[]) => members.filter((id) => others.value.some((u) => u.id === id))
const key = (ids: string[]) => [...ids].sort().join(',')

// immediate: la finestra può nascere già aperta (Membri aperta dal menu della visibilità)
watch(
  open,
  (o) => {
    if (!o) return
    draft.value = Object.fromEntries(restricted.value.map((p) => [p.id, original(p.members)]))
    filter.value = props.projectId && restricted.value.some((p) => p.id === props.projectId) ? props.projectId : ''
  },
  { immediate: true },
)

const rows = computed(() => restricted.value.filter((p) => !filter.value || p.id === filter.value))
const changedIds = computed(() => restricted.value.filter((p) => draft.value[p.id] && key(draft.value[p.id]!) !== key(original(p.members))).map((p) => p.id))

const canSee = (pid: string, uid: string) => !!draft.value[pid]?.includes(uid)
function toggle(pid: string, uid: string) {
  const ids = draft.value[pid] ?? []
  draft.value[pid] = ids.includes(uid) ? ids.filter((id) => id !== uid) : [...ids, uid]
}

async function save() {
  const ids = changedIds.value
  for (const id of ids) await ws.updateProject(id, { members: draft.value[id]! })
  open.value = false
  if (ids.length) ui.toast(m.saved(ids.length), 'success', undefined, 2500)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.lead" width="xl">
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <label class="text-[13px] font-semibold" for="perm-filter">{{ m.filter }}</label>
        <select id="perm-filter" v-model="filter" class="field field-sm w-72" :disabled="!restricted.length">
          <option value="">{{ m.allProjects }}</option>
          <option v-for="p in restricted" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <span v-if="publicCount" class="flex items-center gap-1.5 text-[12px] text-ink-3" data-public-count>
          <span class="inline-block h-2 w-2 rounded-full bg-ok" /> {{ m.publicCount(publicCount) }}
        </span>
        <span class="ml-auto flex items-center gap-1 text-[12px] text-ink-3"><Shield :size="12" /> {{ m.adminsSeeAll }}</span>
      </div>

      <p v-if="sharing.workspaceText.value" class="flex items-start gap-1.5 rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2" data-share-blocked>
        <HardDrive :size="14" class="mt-0.5 shrink-0 text-p-alta" /> {{ sharing.workspaceText.value }}
      </p>
      <p v-if="!restricted.length" class="rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-2" data-no-restricted>{{ m.noRestricted }}</p>
      <p v-else-if="!others.length" class="rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{{ m.noOthers }}</p>
      <div v-else class="max-h-[60vh] overflow-auto rounded-md border border-line">
        <table class="w-full border-collapse text-[13px]" data-permissions>
          <thead class="sticky top-0 z-10 bg-surface">
            <tr class="border-b border-line">
              <th class="sticky left-0 z-10 min-w-48 bg-surface px-3 py-2 text-left font-semibold">{{ m.project }}</th>
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
                <span class="flex items-center gap-1.5">
                  <VisibilityDot :project="p" />
                  <span class="font-semibold">{{ p.name }}</span>
                  <span v-if="changedIds.includes(p.id)" class="text-[11px] font-semibold text-p-alta">●</span>
                  <span v-if="blockedText(p)" class="flex items-center gap-1 text-[11px] text-p-alta" :title="blockedText(p)" data-share-blocked><HardDrive :size="11" /> {{ m.local }}</span>
                  <span v-else-if="!draft[p.id]?.length" class="text-[11px] text-ink-3">({{ m.onlyAdmins }})</span>
                </span>
              </td>
              <td v-for="u in others" :key="u.id" class="px-2 py-1.5 text-center">
                <input type="checkbox" class="accent-accent disabled:opacity-40" :checked="canSee(p.id, u.id)" :disabled="!!blockedText(p)" :title="blockedText(p) || undefined" :aria-label="m.canSee(u.displayName, p.name)" @change="toggle(p.id, u.id)" />
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
