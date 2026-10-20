<script setup lang="ts">
import { computed } from 'vue'
import { Check, CircleHelp, X } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { pcStatus, type PcStatus } from '@/services/health'
import { prereqsOf } from '@/services/readiness'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'PC pronti per progetto',
    lead: 'Chi può lavorare subito a cosa: per ogni progetto con prerequisiti, l’esito delle verifiche fatte in background sul PC di ciascuno.',
    ready: 'pronto',
    missing: (list: string) => `manca: ${list}`,
    unknown: 'non ancora verificato (o esito vecchio)',
    noAccess: 'non vede il progetto',
    none: 'Nessun progetto ha prerequisiti nello Stack.',
  },
  en: {
    title: 'PCs ready per project',
    lead: 'Who can start working on what right away: for every project with prerequisites, the result of the background checks on each person’s PC.',
    ready: 'ready',
    missing: (list: string) => `missing: ${list}`,
    unknown: 'not checked yet (or old result)',
    noAccess: 'cannot see the project',
    none: 'No project has prerequisites in its Stack.',
  },
})

/** Matrice progetti × persone con lo stato del PC (solo workspace di rete). */
const ws = useWorkspaceStore()
const projects = computed(() => ws.visibleProjects.filter((p) => prereqsOf(p).length))
const label = (c: PcStatus) => (c.state === 'ready' ? m.ready : c.state === 'missing' ? m.missing(c.missing.join(', ')) : m.unknown)
const cell = (projectId: string, userId: string) => {
  const p = ws.projects[projectId]!
  const u = ws.usersById[userId]!
  if (!ws.canUserSee(u, p)) return null
  return pcStatus(p.id, prereqsOf(p), ws.readiness[u.id])
}
</script>

<template>
  <section class="max-w-5xl" data-pc-matrix>
    <h2 class="text-[13px] font-semibold text-ink-2">{{ m.title }}</h2>
    <p class="mb-3 mt-0.5 max-w-3xl text-[12.5px] text-ink-3">{{ m.lead }}</p>
    <p v-if="!projects.length" class="text-[13px] text-ink-3">{{ m.none }}</p>
    <div v-else class="overflow-x-auto">
      <table class="text-[13px]">
        <thead>
          <tr>
            <th />
            <th v-for="u in ws.users" :key="u.id" class="px-2 pb-1 text-center" :title="u.displayName"><UserAvatar :name="u.displayName" size="xs" class="mx-auto" /></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="p in projects" :key="p.id" :data-pc-row="p.name">
            <td class="py-1.5 pr-4"><RouterLink :to="{ name: 'project', params: { id: p.id, section: 'stack' } }" class="hover:underline">{{ p.name }}</RouterLink></td>
            <td v-for="u in ws.users" :key="u.id" class="px-2 text-center" :data-pc-cell="u.displayName">
              <span v-if="cell(p.id, u.id)" class="inline-flex" :title="label(cell(p.id, u.id)!)" :data-pc-state="cell(p.id, u.id)!.state">
                <Check v-if="cell(p.id, u.id)!.state === 'ready'" :size="15" class="text-ok" :aria-label="label(cell(p.id, u.id)!)" />
                <X v-else-if="cell(p.id, u.id)!.state === 'missing'" :size="15" class="text-danger" :aria-label="label(cell(p.id, u.id)!)" />
                <CircleHelp v-else :size="14" class="text-ink-3" :aria-label="label(cell(p.id, u.id)!)" />
              </span>
              <span v-else class="text-[11px] text-ink-3" :title="m.noAccess">–</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
