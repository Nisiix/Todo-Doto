<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { CalendarRange } from 'lucide-vue-next'
import UpgradeNotice from '@/components/ui/UpgradeNotice.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { buildTimeline, type TimelineEntry } from '@/services/timeline'
import { PRIORITY_LABEL } from '@/types'

/** Scadenze di tutti i progetti visibili, settimana per settimana (piano Business). */
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()

const projectFilter = ref('')
const weeks = ref(8)
const projects = computed(() => (projectFilter.value ? ws.visibleProjects.filter((p) => p.id === projectFilter.value) : ws.visibleProjects))
const columns = computed(() => buildTimeline(projects.value, weeks.value))
const total = computed(() => columns.value.reduce((n, c) => n + c.entries.length, 0))

function go(e: TimelineEntry) {
  ui.selectedItemId = e.item.id
  router.push({ name: 'project', params: { id: e.project.id }, query: { item: e.item.id } })
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="shrink-0 px-8 pb-3 pt-6">
      <h1 class="flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><CalendarRange :size="22" class="text-accent" /> {{ t('Timeline') }}</h1>
      <p class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{{ t('Le cose da fare di tutti i progetti, settimana per settimana. Clicca un elemento per aprirlo.') }}</p>
      <div v-if="ws.can('timeline')" class="mt-4 flex flex-wrap items-center gap-2">
        <select v-model="projectFilter" class="field field-sm w-56" :aria-label="t('Progetto')">
          <option value="">{{ t('Tutti i progetti') }}</option>
          <option v-for="p in ws.visibleProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-model.number="weeks" class="field field-sm w-40" :aria-label="t('Orizzonte')">
          <option :value="4">{{ t('4 settimane') }}</option>
          <option :value="8">{{ t('8 settimane') }}</option>
          <option :value="12">{{ t('12 settimane') }}</option>
        </select>
        <span class="text-[12.5px] text-ink-3">{{ t('{n} elementi da fare', { n: total }) }}</span>
      </div>
    </header>

    <UpgradeNotice v-if="!ws.can('timeline')" feature="timeline" class="mx-8 mt-2">{{ t('Le scadute, questa settimana, le prossime e quelle senza data, in colonne, per tutti i progetti.') }}</UpgradeNotice>

    <div v-else class="flex min-h-0 flex-1 gap-3 overflow-x-auto px-8 pb-6">
      <section
        v-for="c in columns"
        :key="c.id"
        class="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-surface"
        :class="{ 'border-danger/40': c.kind === 'overdue' && c.entries.length, 'border-accent/50': c.id === 'w0' }"
      >
        <header class="border-b border-line px-3 py-2">
          <h2 class="text-[13px] font-bold" :class="{ 'text-danger': c.kind === 'overdue' && c.entries.length }">{{ c.label }} <span class="font-medium tabular-nums text-ink-3">{{ c.entries.length || '' }}</span></h2>
          <p v-if="c.hint" class="text-[11.5px] text-ink-3">{{ c.hint }}</p>
        </header>
        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          <li v-for="e in c.entries" :key="e.item.id">
            <button class="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2" @click="go(e)">
              <span class="mt-1 h-3.5 w-1 shrink-0 rounded-full" :class="`bg-p-${e.item.priority}`" :title="t(PRIORITY_LABEL[e.item.priority])" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium group-hover:text-accent-ink">{{ e.item.title }}</span>
                <span class="block truncate text-[11.5px] text-ink-3">{{ e.project.name }}<template v-if="e.item.dueDate"> · {{ dayjs(e.item.dueDate).format('ddd D MMM') }}</template></span>
              </span>
            </button>
          </li>
          <li v-if="!c.entries.length" class="px-2 py-1.5 text-[12px] text-ink-3">—</li>
        </ul>
      </section>
    </div>
  </div>
</template>
