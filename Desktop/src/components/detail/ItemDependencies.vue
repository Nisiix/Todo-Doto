<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { AlertTriangle, Check, Link2, Lock, Plus, X } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { blockedByThis, blockerCandidates, dueConflicts, openBlockers } from '@/services/dependencies'
import { firstLine } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import type { Item, Project } from '@/types'
import { DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Dipendenze',
    blockedBy: 'Va fatto dopo',
    blockedHint: 'Il task resta bloccato finché questi non sono completati.',
    waiting: 'Lo aspettano',
    add: 'Aggiungi un task da finire prima…',
    none: 'Nessuna: si può fare in qualunque momento.',
    remove: 'Togli la dipendenza',
    done: 'completato',
    blocked: (n: number) => (n === 1 ? 'Bloccato da un task ancora da fare' : `Bloccato da ${n} task ancora da fare`),
    conflict: (code: string, d: string) => `${code} scade il ${d}, dopo questo task: non si può finire in tempo.`,
  },
  en: {
    title: 'Dependencies',
    blockedBy: 'Must come after',
    blockedHint: 'The task stays blocked until these are completed.',
    waiting: 'Waiting for it',
    add: 'Add a task to finish first…',
    none: 'None: it can be done at any time.',
    remove: 'Remove the dependency',
    done: 'completed',
    blocked: (n: number) => (n === 1 ? 'Blocked by a task still to do' : `Blocked by ${n} tasks still to do`),
    conflict: (code: string, d: string) => `${code} is due on ${d}, after this task: it cannot be finished in time.`,
  },
})

/**
 * Dipendenze del task: i task da finire prima («va fatto dopo») e quelli che
 * lo aspettano. Si salvano subito, come i commenti; i cicli non si possono creare.
 */
const props = defineProps<{ item: Item; project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const ui = useUiStore()

const items = computed(() => props.project.items)
const byId = computed(() => new Map(items.value.map((i) => [i.id, i])))
const blockers = computed(() => props.item.blockedBy.map((id) => byId.value.get(id)).filter((i): i is Item => !!i))
const open = computed(() => openBlockers(props.item, items.value))
const waiting = computed(() => blockedByThis(props.item.id, items.value).filter((i) => i.bucket !== 'trash'))
const conflicts = computed(() => dueConflicts(props.item, items.value))
const candidates = computed(() => blockerCandidates(props.item, items.value))
const label = (i: Item) => [i.seq ? taskCode(i.seq) : '', firstLine(i.title)].filter(Boolean).join(' ')
const picking = ref('')

async function add(id: string) {
  picking.value = ''
  if (id) await ws.setBlockers(props.project.id, props.item.id, [...props.item.blockedBy, id])
}
const remove = (id: string) => ws.setBlockers(props.project.id, props.item.id, props.item.blockedBy.filter((b) => b !== id))
const select = (i: Item) => (ui.selectedItemId = i.id)
</script>

<template>
  <section v-if="!readOnly || blockers.length || waiting.length" data-dependencies>
    <h3 class="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><Link2 :size="14" /> {{ m.title }}</h3>
    <p v-if="open.length" class="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-p-alta" data-blocked><Lock :size="13" /> {{ m.blocked(open.length) }}</p>
    <p v-for="c in conflicts" :key="c.id" class="mb-2 flex items-start gap-1.5 text-[12.5px] text-danger" data-due-conflict>
      <AlertTriangle :size="13" class="mt-0.5 shrink-0" /> {{ m.conflict(c.seq ? taskCode(c.seq) : firstLine(c.title), dayjs(c.dueDate!).format(DATE.date)) }}
    </p>

    <p class="text-[12px] text-ink-3">{{ m.blockedBy }}</p>
    <ul v-if="blockers.length" class="mt-1 space-y-1" data-blockers>
      <li v-for="b in blockers" :key="b.id" class="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-[13px]">
        <component :is="b.bucket === 'todo' ? Lock : Check" :size="13" class="shrink-0" :class="b.bucket === 'todo' ? 'text-p-alta' : 'text-ok'" />
        <button type="button" class="min-w-0 flex-1 truncate text-left hover:text-accent-ink" :class="{ 'text-ink-3 line-through': b.bucket !== 'todo' }" @click="select(b)">{{ label(b) }}</button>
        <span v-if="b.bucket === 'done'" class="shrink-0 text-[11px] text-ink-3">{{ m.done }}</span>
        <button v-if="!readOnly" type="button" class="shrink-0 rounded p-0.5 text-ink-3 hover:bg-surface-2 hover:text-danger" :title="m.remove" :aria-label="m.remove" @click="remove(b.id)"><X :size="12" /></button>
      </li>
    </ul>
    <p v-else-if="readOnly || !candidates.length" class="mt-1 text-[12px] text-ink-3">{{ m.none }}</p>
    <label v-if="!readOnly && candidates.length" class="mt-1.5 flex items-center gap-2">
      <Plus :size="13" class="shrink-0 text-ink-3" />
      <select v-model="picking" class="field field-sm min-w-0 flex-1" :aria-label="m.add" data-add-blocker @change="add(picking)">
        <option value="">{{ m.add }}</option>
        <option v-for="c in candidates" :key="c.id" :value="c.id">{{ label(c) }}</option>
      </select>
    </label>
    <p v-if="!readOnly && !blockers.length" class="mt-1 text-[11.5px] text-ink-3">{{ m.blockedHint }}</p>

    <template v-if="waiting.length">
      <p class="mt-3 text-[12px] text-ink-3">{{ m.waiting }}</p>
      <ul class="mt-1 space-y-0.5" data-waiting>
        <li v-for="w in waiting" :key="w.id">
          <button type="button" class="w-full truncate rounded px-1 text-left text-[13px] hover:bg-surface-2 hover:text-accent-ink" :class="{ 'text-ink-3 line-through': w.bucket !== 'todo' }" @click="select(w)">{{ label(w) }}</button>
        </li>
      </ul>
    </template>
  </section>
</template>
