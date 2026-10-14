<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { isFilterActive } from '@/services/items'
import {
  EMPTY_FILTER,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  type ItemFilter,
  type Priority,
  type Status,
} from '@/types'

/** Barra dei filtri della lista: scadenza da/a, stato, priorità, utente. */
const model = defineModel<ItemFilter>({ required: true })
const ws = useWorkspaceStore()

const active = computed(() => isFilterActive(model.value))

function set<K extends keyof ItemFilter>(key: K, value: ItemFilter[K]) {
  model.value = { ...model.value, [key]: value }
}
const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const toggleStatus = (s: Status) => set('statuses', toggleIn(model.value.statuses, s))
const togglePriority = (p: Priority) => set('priorities', toggleIn(model.value.priorities, p))
const reset = () => (model.value = { ...EMPTY_FILTER })

const chip =
  'h-6 rounded-full border px-2 text-[12px] font-medium transition-colors select-none ' +
  'aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-ink'
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]" role="group" aria-label="Filtri">
    <label class="flex items-center gap-1.5 text-ink-2">
      Da
      <input type="date" class="field field-sm h-6 w-32 py-0" :value="model.from ?? ''" @change="set('from', ($event.target as HTMLInputElement).value || null)" />
    </label>
    <label class="flex items-center gap-1.5 text-ink-2">
      A
      <input type="date" class="field field-sm h-6 w-32 py-0" :value="model.to ?? ''" @change="set('to', ($event.target as HTMLInputElement).value || null)" />
    </label>

    <div class="flex items-center gap-1">
      <button
        v-for="s in STATUSES"
        :key="s"
        type="button"
        :class="[chip, model.statuses.includes(s) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2']"
        :aria-pressed="model.statuses.includes(s)"
        @click="toggleStatus(s)"
      >
        {{ STATUS_LABEL[s] }}
      </button>
    </div>

    <div class="flex items-center gap-1">
      <button
        v-for="p in PRIORITIES"
        :key="p"
        type="button"
        class="flex items-center gap-1.5"
        :class="[chip, model.priorities.includes(p) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2']"
        :aria-pressed="model.priorities.includes(p)"
        @click="togglePriority(p)"
      >
        <span class="h-2 w-2 rounded-full" :class="`bg-p-${p}`" />
        {{ PRIORITY_LABEL[p] }}
      </button>
    </div>

    <select class="field field-sm h-6 w-40 py-0" :value="model.userId ?? ''" aria-label="Creato da" @change="set('userId', ($event.target as HTMLSelectElement).value || null)">
      <option value="">Tutti gli utenti</option>
      <option v-for="u in ws.users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
    </select>

    <select v-if="ws.tree.labels.length" class="field field-sm h-6 w-36 py-0" :value="model.labelId ?? ''" aria-label="Etichetta" @change="set('labelId', ($event.target as HTMLSelectElement).value || null)">
      <option value="">Tutte le etichette</option>
      <option v-for="l in ws.tree.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
    </select>

    <button v-if="active" type="button" class="flex items-center gap-1 text-[12px] font-medium text-accent-ink hover:underline" @click="reset">
      <X :size="12" /> Azzera filtri
    </button>
  </div>
</template>
