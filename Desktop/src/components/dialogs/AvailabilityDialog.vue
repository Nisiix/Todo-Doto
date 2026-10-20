<script setup lang="ts">
import { ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { newId } from '@/services/ids'
import type { Absence } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: (n: string) => `Disponibilità di ${n}`,
    description: 'Le ore a settimana per i task e le assenze servono al carico per settimana (Analisi) e avvisano chi assegna un task in quei giorni.',
    hours: 'Ore a settimana per i task',
    hoursHint: '0 = non indicate: il carico si conta in scadenze invece che in ore.',
    absences: 'Assenze',
    none: 'Nessuna assenza indicata.',
    from: 'Dal',
    to: 'Al',
    note: 'Nota',
    notePlaceholder: 'Ferie, trasferta…',
    add: 'Aggiungi assenza',
    remove: 'Togli',
  },
  en: {
    title: (n: string) => `${n}’s availability`,
    description: 'Weekly hours for tasks and absences feed the load by week (Analytics) and warn whoever assigns a task on those days.',
    hours: 'Hours per week for tasks',
    hoursHint: '0 = not set: load is counted in due dates instead of hours.',
    absences: 'Absences',
    none: 'No absences set.',
    from: 'From',
    to: 'To',
    note: 'Note',
    notePlaceholder: 'Holiday, business trip…',
    add: 'Add absence',
    remove: 'Remove',
  },
})

/** Ore settimanali e assenze di un utente (la persona stessa o un amministratore). */
const props = defineProps<{ userId: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const hours = ref(0)
const list = ref<Absence[]>([])
watch(open, (o) => {
  const u = props.userId ? ws.usersById[props.userId] : undefined
  if (!o || !u) return
  hours.value = u.weeklyHours
  list.value = u.absences.map((a) => ({ ...a }))
})
const add = () => list.value.push({ id: newId('abs'), from: '', to: '', note: '' })
async function save() {
  if (!props.userId) return
  await ws.setAvailability(props.userId, { weeklyHours: Number(hours.value) || 0, absences: list.value.map((a) => ({ ...a, to: a.to || a.from })) })
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title(ws.userName(userId))" :description="m.description" width="md">
    <form class="space-y-4" data-availability @submit.prevent="save()">
      <div>
        <label class="label" for="av-hours">{{ m.hours }}</label>
        <input id="av-hours" v-model.number="hours" type="number" min="0" max="80" class="field w-28" />
        <p class="mt-1 text-[11.5px] text-ink-3">{{ m.hoursHint }}</p>
      </div>
      <fieldset>
        <legend class="label">{{ m.absences }}</legend>
        <p v-if="!list.length" class="text-[12.5px] text-ink-3">{{ m.none }}</p>
        <ul class="space-y-2">
          <li v-for="a in list" :key="a.id" class="grid grid-cols-[8.5rem_8.5rem_minmax(0,1fr)_auto] items-end gap-2" data-absence>
            <label class="flex flex-col gap-1 text-[11.5px] text-ink-3">{{ m.from }}<input v-model="a.from" type="date" class="field field-sm" data-absence-from /></label>
            <label class="flex flex-col gap-1 text-[11.5px] text-ink-3">{{ m.to }}<input v-model="a.to" type="date" class="field field-sm" :min="a.from" data-absence-to /></label>
            <label class="flex flex-col gap-1 text-[11.5px] text-ink-3">{{ m.note }}<input v-model="a.note" class="field field-sm" :placeholder="m.notePlaceholder" /></label>
            <BaseButton size="icon-sm" variant="ghost" :title="m.remove" @click="list = list.filter((x) => x.id !== a.id)"><Trash2 :size="13" /></BaseButton>
          </li>
        </ul>
        <BaseButton size="sm" variant="ghost" class="mt-2" data-absence-add @click="add()"><Plus :size="13" /> {{ m.add }}</BaseButton>
      </fieldset>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" data-availability-save @click="save()">{{ common.actions.save }}</BaseButton>
    </template>
  </BaseDialog>
</template>
