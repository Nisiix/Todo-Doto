<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { Download, History } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import UpgradeNotice from '@/components/ui/UpgradeNotice.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
import { PLANS } from '@/services/license'
import { AUDIT_ACTIONS, AUDIT_LABEL, ROLE_LABEL, type AuditAction } from '@/types'

/**
 * Cronologia delle operazioni sugli elementi e sui progetti, divisa per
 * progetto: creazioni, completamenti, cestino, ripristini, eliminazioni.
 * Domande, risposte, commenti e descrizioni non vengono registrati.
 * Piano Team: ultimi 90 giorni. Business: tutto, con export CSV.
 */
const ws = useWorkspaceStore()
const ui = useUiStore()

const projectFilter = ref<string>('')
const actionFilter = ref<AuditAction | ''>('')
const userFilter = ref<string>('')

const auditDays = computed(() => PLANS[ws.plan.plan].auditDays)
const since = computed(() => (auditDays.value === null ? null : dayjs().subtract(auditDays.value, 'day').toISOString()))
/** Voci consultabili con il piano corrente. */
const available = computed(() => (since.value ? ws.audit.filter((e) => e.at >= since.value!) : ws.audit))
const hiddenCount = computed(() => ws.audit.length - available.value.length)

const projectNames = computed(() => {
  const m = new Map<string, string>()
  for (const e of available.value) m.set(e.projectId, ws.projects[e.projectId]?.name ?? e.projectName)
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'it'))
})

const entries = computed(() =>
  [...available.value]
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
  e.action === 'trash_emptied' || e.action === 'items_imported' ? `${t(AUDIT_LABEL[e.action])} (${e.count} elementi)` : e.itemTitle ? `${t(AUDIT_LABEL[e.action])}: «${e.itemTitle}»` : t(AUDIT_LABEL[e.action])
const roleOf = (id: string) => {
  const u = ws.usersById[id]
  return u ? t(ROLE_LABEL[u.role]) : ''
}

async function exportCsv() {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [['Data', 'Utente', 'Ruolo', 'Progetto', 'Operazione', 'Elemento', 'Conteggio'].join(';')]
  for (const e of entries.value) {
    rows.push([dayjs(e.at).format('YYYY-MM-DD HH:mm:ss'), ws.userName(e.userId), roleOf(e.userId), ws.projects[e.projectId]?.name ?? e.projectName, t(AUDIT_LABEL[e.action]), e.itemTitle, e.count].map(cell).join(';'))
  }
  const fs = await getFs()
  if (await fs.saveTextAs(`cronologia-${dayjs().format('YYYY-MM-DD')}.csv`, '﻿' + rows.join('\r\n') + '\r\n')) ui.toast(t('CSV salvato'), 'success')
}
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8">
    <h1 class="flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><History :size="22" class="text-accent" /> {{ t('Cronologia') }}</h1>
    <p class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
      {{ t('Registro delle operazioni sugli elementi e sui progetti: chi ha creato, completato, cestinato, ripristinato o eliminato cosa, e quando. Domande, risposte, commenti e descrizioni non vengono registrati.') }}
    </p>

    <UpgradeNotice v-if="!ws.can('audit')" feature="audit" class="mt-6">
      {{ t('Le operazioni vengono comunque registrate: attivando il piano le vedrai da oggi indietro.') }}
    </UpgradeNotice>

    <template v-else>
      <div class="mt-5 flex flex-wrap gap-2">
        <select v-model="projectFilter" class="field field-sm w-56" :aria-label="t('Progetto')">
          <option value="">{{ t('Tutti i progetti') }}</option>
          <option v-for="[id, name] in projectNames" :key="id" :value="id">{{ name }}</option>
        </select>
        <select v-model="actionFilter" class="field field-sm w-56" :aria-label="t('Operazione')">
          <option value="">{{ t('Tutte le operazioni') }}</option>
          <option v-for="a in AUDIT_ACTIONS" :key="a" :value="a">{{ t(AUDIT_LABEL[a]) }}</option>
        </select>
        <select v-model="userFilter" class="field field-sm w-48" :aria-label="t('Utente')">
          <option value="">{{ t('Tutti gli utenti') }}</option>
          <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
        </select>
        <span class="self-center text-[12.5px] text-ink-3">{{ t('{n} operazioni', { n: entries.length }) }}</span>
        <BaseButton v-if="ws.can('auditUnlimited')" size="sm" class="ml-auto" :disabled="!entries.length" @click="exportCsv"><Download :size="13" /> {{ t('Esporta CSV') }}</BaseButton>
      </div>
      <p v-if="auditDays !== null && hiddenCount > 0" class="mt-2 text-[12.5px] text-ink-3">
        {{ t('Il piano Team mostra gli ultimi {days} giorni: {n} operazioni più vecchie sono conservate ma nascoste.', { days: auditDays ?? 0, n: hiddenCount }) }}
        <button class="font-semibold text-accent-ink hover:underline" @click="ui.showLicense = true">{{ t('Piano Business') }}</button>
      </p>

      <section v-for="g in groups" :key="g.name" class="mt-7 max-w-4xl">
        <h2 class="mb-1 text-[14px] font-bold">{{ g.name }}</h2>
        <ul class="divide-y divide-line">
          <li v-for="e in g.entries" :key="e.id" class="flex items-center gap-3 py-2 text-[13px]">
            <span class="w-32 shrink-0 tabular-nums text-ink-3" :title="dayjs(e.at).format('D MMMM YYYY HH:mm:ss')">{{ dayjs(e.at).format('D MMM YYYY HH:mm') }}</span>
            <UserAvatar :name="ws.userName(e.userId)" size="xs" />
            <span class="w-40 shrink-0 truncate">
              {{ ws.userName(e.userId) }}
              <span class="text-[11px] text-ink-3">{{ roleOf(e.userId) }}</span>
            </span>
            <span class="min-w-0 flex-1 truncate" :class="{ 'text-danger': e.action === 'item_deleted' || e.action === 'project_deleted' || e.action === 'trash_emptied' }">{{ describe(e) }}</span>
          </li>
        </ul>
      </section>
      <p v-if="!groups.length" class="mt-8 text-[13.5px] text-ink-3">{{ projectFilter || actionFilter || userFilter ? t('Nessuna operazione registrata con questi filtri.') : t('Nessuna operazione registrata.') }}</p>
    </template>
  </div>
</template>
