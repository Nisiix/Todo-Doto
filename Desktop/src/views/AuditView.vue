<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { History } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { AUDIT_ACTIONS, AUDIT_LABEL, ROLE_LABEL, type AuditAction } from '@/types'
import { compareText, DATE, defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    emptied: (label: string, n: number) => `${label} (${n} ${plural(n, 'elemento', 'elementi')})`,
    onItem: (label: string, title: string) => `${label}: «${title}»`,
    title: 'Cronologia',
    lead: 'Registro delle operazioni sugli elementi e sui progetti: chi ha creato, completato, cestinato, ripristinato o eliminato cosa, e quando. Domande, risposte, commenti e descrizioni non vengono registrati.',
    project: 'Progetto',
    allProjects: 'Tutti i progetti',
    action: 'Operazione',
    allActions: 'Tutte le operazioni',
    user: 'Utente',
    allUsers: 'Tutti gli utenti',
    count: (n: number) => `${n} ${plural(n, 'operazione', 'operazioni')}`,
    none: 'Nessuna operazione registrata.',
    noneFiltered: 'Nessuna operazione registrata con questi filtri.',
  },
  en: {
    emptied: (label: string, n: number) => `${label} (${n} ${plural(n, 'item', 'items')})`,
    onItem: (label: string, title: string) => `${label}: “${title}”`,
    title: 'Activity log',
    lead: 'Log of the operations on items and projects: who created, completed, trashed, restored or deleted what, and when. Questions, answers, comments and descriptions are not logged.',
    project: 'Project',
    allProjects: 'All projects',
    action: 'Operation',
    allActions: 'All operations',
    user: 'User',
    allUsers: 'All users',
    count: (n: number) => `${n} ${plural(n, 'operation', 'operations')}`,
    none: 'No operations logged.',
    noneFiltered: 'No operations logged with these filters.',
  },
})

/**
 * Cronologia delle operazioni sugli elementi e sui progetti, divisa per
 * progetto: creazioni, completamenti, cestino, ripristini, eliminazioni.
 * Domande, risposte, commenti e descrizioni non vengono registrati.
 */
const ws = useWorkspaceStore()

const projectFilter = ref<string>('')
const actionFilter = ref<AuditAction | ''>('')
const userFilter = ref<string>('')

const projectNames = computed(() => {
  const names = new Map<string, string>()
  for (const e of ws.audit) names.set(e.projectId, ws.projects[e.projectId]?.name ?? e.projectName)
  return [...names.entries()].sort((a, b) => compareText(a[1], b[1]))
})

const entries = computed(() =>
  [...ws.audit]
    .filter((e) => (!projectFilter.value || e.projectId === projectFilter.value) && (!actionFilter.value || e.action === actionFilter.value) && (!userFilter.value || e.userId === userFilter.value))
    .sort((a, b) => b.at.localeCompare(a.at)),
)

/** Raggruppate per progetto, i progetti con attività più recente prima. */
const groups = computed(() => {
  const map = new Map<string, { name: string; entries: typeof entries.value }>()
  for (const e of entries.value) {
    const g = map.get(e.projectId) ?? { name: ws.projects[e.projectId]?.name ?? e.projectName, entries: [] }
    g.entries.push(e)
    map.set(e.projectId, g)
  }
  return [...map.values()]
})

const describe = (e: (typeof entries.value)[number]) =>
  e.action === 'trash_emptied' ? m.emptied(AUDIT_LABEL[e.action], e.count ?? 0) : e.itemTitle ? m.onItem(AUDIT_LABEL[e.action], e.itemTitle) : AUDIT_LABEL[e.action]
const roleOf = (id: string) => {
  const u = ws.usersById[id]
  return u ? ROLE_LABEL[u.role] : ''
}
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8">
    <h1 class="flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><History :size="22" class="text-accent" /> {{ m.title }}</h1>
    <p class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
      {{ m.lead }}
    </p>

    <div class="mt-5 flex flex-wrap gap-2">
      <select v-model="projectFilter" class="field field-sm w-56" :aria-label="m.project">
        <option value="">{{ m.allProjects }}</option>
        <option v-for="[id, name] in projectNames" :key="id" :value="id">{{ name }}</option>
      </select>
      <select v-model="actionFilter" class="field field-sm w-56" :aria-label="m.action">
        <option value="">{{ m.allActions }}</option>
        <option v-for="a in AUDIT_ACTIONS" :key="a" :value="a">{{ AUDIT_LABEL[a] }}</option>
      </select>
      <select v-model="userFilter" class="field field-sm w-48" :aria-label="m.user">
        <option value="">{{ m.allUsers }}</option>
        <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
      </select>
      <span class="self-center text-[12.5px] text-ink-3">{{ m.count(entries.length) }}</span>
    </div>

    <section v-for="g in groups" :key="g.name" class="mt-7 max-w-4xl">
      <h2 class="mb-1 text-[14px] font-bold">{{ g.name }}</h2>
      <ul class="divide-y divide-line">
        <li v-for="e in g.entries" :key="e.id" class="flex items-center gap-3 py-2 text-[13px]">
          <span class="w-32 shrink-0 tabular-nums text-ink-3" :title="dayjs(e.at).format(DATE.dateTimeLong)">{{ dayjs(e.at).format(DATE.dateTime) }}</span>
          <UserAvatar :name="ws.userName(e.userId)" size="xs" />
          <span class="w-40 shrink-0 truncate">
            {{ ws.userName(e.userId) }}
            <span class="text-[11px] text-ink-3">{{ roleOf(e.userId) }}</span>
          </span>
          <span class="min-w-0 flex-1 truncate" :class="{ 'text-danger': e.action === 'item_deleted' || e.action === 'project_deleted' || e.action === 'trash_emptied' }">{{ describe(e) }}</span>
        </li>
      </ul>
    </section>
    <p v-if="!groups.length" class="mt-8 text-[13.5px] text-ink-3">{{ projectFilter || actionFilter || userFilter ? m.noneFiltered : m.none }}</p>
  </div>
</template>
