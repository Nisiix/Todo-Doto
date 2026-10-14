<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { isFilterActive } from '@/services/items'
import { EMPTY_FILTER, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type ItemFilter, type Priority, type Status } from '@/types'
import { DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    filters: 'Filtri',
    showFilters: 'Mostra i filtri',
    hideFilters: 'Nascondi i filtri',
    due: 'Scadenza',
    from: 'dal',
    to: 'al',
    status: 'Stato',
    priority: 'Priorità',
    people: 'Persone',
    assignee: 'Assegnato a',
    author: 'Creato da',
    anyone: 'Chiunque',
    label: 'Etichetta',
    allLabels: 'Tutte',
    reset: 'Azzera filtri',
    remove: (what: string) => `Togli il filtro ${what}`,
    noneActive: 'Nessun filtro: vedi tutti gli elementi.',
    dueFrom: (d: string) => `Scadenza dal ${d}`,
    dueTo: (d: string) => `Scadenza fino al ${d}`,
    dueRange: (a: string, b: string) => `Scadenza ${a} – ${b}`,
    dueHint: 'Solo gli elementi con una scadenza nel periodo.',
  },
  en: {
    filters: 'Filters',
    showFilters: 'Show filters',
    hideFilters: 'Hide filters',
    due: 'Due date',
    from: 'from',
    to: 'to',
    status: 'Status',
    priority: 'Priority',
    people: 'People',
    assignee: 'Assigned to',
    author: 'Created by',
    anyone: 'Anyone',
    label: 'Label',
    allLabels: 'All',
    reset: 'Clear filters',
    remove: (what: string) => `Remove the filter ${what}`,
    noneActive: 'No filters: showing every item.',
    dueFrom: (d: string) => `Due from ${d}`,
    dueTo: (d: string) => `Due until ${d}`,
    dueRange: (a: string, b: string) => `Due ${a} – ${b}`,
    dueHint: 'Only items with a due date in the period.',
  },
})

/**
 * Filtri della lista. Una riga compatta con il pulsante "Filtri" (e il numero
 * di filtri attivi) e i filtri attivi come etichette rimovibili; il pannello
 * raggruppa le scelte per tema: scadenza, stato, priorità, persone, etichetta.
 */
const model = defineModel<ItemFilter>({ required: true })
const ws = useWorkspaceStore()

const OPEN_KEY = 'pgm:filters-open'
const open = ref(readOpen())
function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}
watch(open, (v) => {
  try {
    localStorage.setItem(OPEN_KEY, v ? '1' : '0')
  } catch {
    /* solo comodità */
  }
})

const active = computed(() => isFilterActive(model.value))
function set<K extends keyof ItemFilter>(key: K, value: ItemFilter[K]) {
  model.value = { ...model.value, [key]: value }
}
const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const toggleStatus = (s: Status) => set('statuses', toggleIn(model.value.statuses, s))
const togglePriority = (p: Priority) => set('priorities', toggleIn(model.value.priorities, p))
const reset = () => (model.value = { ...EMPTY_FILTER })

/** Filtri attivi, ciascuno con il modo di toglierlo. */
const chips = computed(() => {
  const f = model.value
  const out: { key: string; label: string; clear: () => void; dot?: string }[] = []
  const d = (s: string) => dayjs(s).format(DATE.dayMonth)
  if (f.from || f.to)
    out.push({
      key: 'due',
      label: f.from && f.to ? m.dueRange(d(f.from), d(f.to)) : f.from ? m.dueFrom(d(f.from)) : m.dueTo(d(f.to!)),
      clear: () => (model.value = { ...model.value, from: null, to: null }),
    })
  for (const s of f.statuses) out.push({ key: `s-${s}`, label: STATUS_LABEL[s], clear: () => toggleStatus(s) })
  for (const p of f.priorities) out.push({ key: `p-${p}`, label: PRIORITY_LABEL[p], dot: `bg-p-${p}`, clear: () => togglePriority(p) })
  if (f.assigneeId) out.push({ key: 'a', label: `${m.assignee}: ${ws.userName(f.assigneeId)}`, clear: () => set('assigneeId', null) })
  if (f.createdBy) out.push({ key: 'c', label: `${m.author}: ${ws.userName(f.createdBy)}`, clear: () => set('createdBy', null) })
  if (f.labelId) out.push({ key: 'l', label: `${m.label}: ${ws.labelsById[f.labelId]?.name ?? '—'}`, clear: () => set('labelId', null) })
  return out
})

const chip = 'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors select-none'
const chipOn = 'border-accent bg-accent-soft text-accent-ink'
const chipOff = 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
</script>

<template>
  <div class="text-[12.5px]">
    <!-- Riga compatta: pulsante e filtri attivi -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold transition-colors"
        :class="open || active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink-2 hover:text-ink'"
        :aria-expanded="open"
        aria-controls="filter-panel"
        :title="open ? m.hideFilters : m.showFilters"
        @click="open = !open"
      >
        <SlidersHorizontal :size="14" />
        {{ m.filters }}
        <span v-if="chips.length" class="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-white dark:text-[#0d1b24]">{{ chips.length }}</span>
        <ChevronDown :size="13" class="transition-transform" :class="{ 'rotate-180': open }" />
      </button>

      <template v-if="chips.length">
        <span v-for="c in chips" :key="c.key" class="flex h-7 items-center gap-1.5 rounded-full bg-surface-2 pl-2.5 pr-1 text-[12px] font-medium text-ink">
          <span v-if="c.dot" class="h-2 w-2 rounded-full" :class="c.dot" />
          {{ c.label }}
          <button type="button" class="rounded-full p-0.5 text-ink-3 hover:bg-surface-3 hover:text-ink" :aria-label="m.remove(c.label)" @click="c.clear()"><X :size="12" /></button>
        </span>
        <button type="button" class="font-medium text-accent-ink hover:underline" @click="reset">{{ m.reset }}</button>
      </template>
      <span v-else-if="!open" class="text-ink-3">{{ m.noneActive }}</span>
    </div>

    <!-- Pannello: le scelte raggruppate -->
    <div v-if="open" id="filter-panel" class="mt-2 grid gap-x-8 gap-y-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-[auto_auto_1fr]" role="group" :aria-label="m.filters">
      <fieldset>
        <legend class="label">{{ m.status }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="s in STATUSES" :key="s" type="button" :class="[chip, model.statuses.includes(s) ? chipOn : chipOff]" :aria-pressed="model.statuses.includes(s)" @click="toggleStatus(s)">
            {{ STATUS_LABEL[s] }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="label">{{ m.priority }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="p in PRIORITIES" :key="p" type="button" :class="[chip, model.priorities.includes(p) ? chipOn : chipOff]" :aria-pressed="model.priorities.includes(p)" @click="togglePriority(p)">
            <span class="h-2 w-2 rounded-full" :class="`bg-p-${p}`" />
            {{ PRIORITY_LABEL[p] }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="label">{{ m.due }}</legend>
        <div class="flex flex-wrap items-center gap-2 text-ink-2">
          <label class="flex items-center gap-1.5">
            {{ m.from }}
            <input type="date" class="field field-sm h-7 w-36 py-0" :value="model.from ?? ''" @change="set('from', ($event.target as HTMLInputElement).value || null)" />
          </label>
          <label class="flex items-center gap-1.5">
            {{ m.to }}
            <input type="date" class="field field-sm h-7 w-36 py-0" :value="model.to ?? ''" @change="set('to', ($event.target as HTMLInputElement).value || null)" />
          </label>
        </div>
        <p class="mt-1 text-[11.5px] text-ink-3">{{ m.dueHint }}</p>
      </fieldset>

      <fieldset class="md:col-span-2">
        <legend class="label">{{ m.people }}</legend>
        <div class="flex flex-wrap gap-3">
          <label class="flex items-center gap-1.5 text-ink-2">
            {{ m.assignee }}
            <select class="field field-sm h-7 w-44 py-0" :value="model.assigneeId ?? ''" :aria-label="m.assignee" @change="set('assigneeId', ($event.target as HTMLSelectElement).value || null)">
              <option value="">{{ m.anyone }}</option>
              <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1.5 text-ink-2">
            {{ m.author }}
            <select class="field field-sm h-7 w-44 py-0" :value="model.createdBy ?? ''" :aria-label="m.author" @change="set('createdBy', ($event.target as HTMLSelectElement).value || null)">
              <option value="">{{ m.anyone }}</option>
              <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset v-if="ws.tree.labels.length">
        <legend class="label">{{ m.label }}</legend>
        <select class="field field-sm h-7 w-44 py-0" :value="model.labelId ?? ''" :aria-label="m.label" @change="set('labelId', ($event.target as HTMLSelectElement).value || null)">
          <option value="">{{ m.allLabels }}</option>
          <option v-for="l in ws.tree.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </fieldset>
    </div>
  </div>
</template>
