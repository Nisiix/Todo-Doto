<script setup lang="ts">
import { computed, ref } from 'vue'
import { ListChecks, Repeat, X } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { newId } from '@/services/ids'
import type { Item, Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Lista di controllo',
    add: 'Aggiungi una voce e premi Invio',
    remove: 'Togli la voce',
    repeat: 'Si ripete',
    never: 'Mai',
    week: 'Ogni settimana',
    month: 'Ogni mese',
    repeatHint: 'Completandolo nasce il prossimo, con la lista da rifare e la scadenza spostata.',
  },
  en: {
    title: 'Checklist',
    add: 'Add an item and press Enter',
    remove: 'Remove the item',
    repeat: 'Repeats',
    never: 'Never',
    week: 'Every week',
    month: 'Every month',
    repeatHint: 'Completing it creates the next one, with the checklist to do again and the due date moved on.',
  },
})

/** Lista di controllo del task e ripetizione (si salvano subito). */
const props = defineProps<{ item: Item; project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const draft = ref('')
const done = computed(() => props.item.checklist.filter((c) => c.done).length)
const save = (checklist: Item['checklist']) => ws.updateItem(props.project.id, props.item.id, { checklist })
async function add() {
  const t = draft.value.trim()
  if (!t) return
  draft.value = ''
  await save([...props.item.checklist, { id: newId('chk'), text: t, done: false }])
}
const toggle = (id: string) => save(props.item.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)))
const remove = (id: string) => save(props.item.checklist.filter((c) => c.id !== id))
const setRepeat = (r: Item['repeat']) => ws.updateItem(props.project.id, props.item.id, { repeat: r })
</script>

<template>
  <section v-if="!readOnly || item.checklist.length || item.repeat !== 'none'" data-checklist>
    <h3 class="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
      <ListChecks :size="14" /> {{ m.title }}
      <span v-if="item.checklist.length" class="tabular-nums text-ink-3" data-checklist-progress>{{ done }}/{{ item.checklist.length }}</span>
    </h3>
    <ul class="space-y-0.5">
      <li v-for="c in item.checklist" :key="c.id" class="group flex items-center gap-2 text-[13px]" :data-checklist-item="c.text">
        <input type="checkbox" class="accent-accent" :checked="c.done" :disabled="readOnly" :aria-label="c.text" @change="toggle(c.id)" />
        <span class="min-w-0 flex-1" :class="{ 'text-ink-3 line-through': c.done }">{{ c.text }}</span>
        <button v-if="!readOnly" type="button" class="rounded p-0.5 text-ink-3 opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100" :title="m.remove" :aria-label="m.remove" @click="remove(c.id)"><X :size="12" /></button>
      </li>
    </ul>
    <input v-if="!readOnly" v-model="draft" class="field field-sm mt-1.5" :placeholder="m.add" data-checklist-add @keydown.enter.prevent="add()" />
    <label v-if="!readOnly" class="mt-2 flex items-center gap-2 text-[12.5px] text-ink-2">
      <Repeat :size="13" class="text-ink-3" /> {{ m.repeat }}
      <select class="field field-sm w-40" :value="item.repeat" data-repeat @change="setRepeat(($event.target as HTMLSelectElement).value as Item['repeat'])">
        <option value="none">{{ m.never }}</option>
        <option value="week">{{ m.week }}</option>
        <option value="month">{{ m.month }}</option>
      </select>
    </label>
    <p v-if="!readOnly && item.repeat !== 'none'" class="mt-1 text-[11.5px] text-ink-3">{{ m.repeatHint }}</p>
  </section>
</template>
