<script setup lang="ts">
import { ref, watch } from 'vue'
import { CircleHelp, CalendarClock, Siren } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { AutomationsSchema, type Automations } from '@/types'
import { common } from '@/i18n/common'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Automazioni',
    description: 'Regole che lavorano da sole, senza server: ogni PC le controlla per chi lo usa e avvisa una volta sola. Valgono per tutto il workspace.',
    urgent: 'Task urgente senza responsabile',
    urgentHint: 'Se un task con priorità immediata resta senza responsabile, gli amministratori ricevono una notifica.',
    question: 'Domanda senza risposta',
    questionHint: 'Se una domanda resta senza risposta, chi vi è menzionato con @ riceve un avviso.',
    due: 'Confermato senza scadenza',
    dueHint: 'Quando qualcuno conferma un task senza scadenza, l’app gliela chiede subito.',
    after: 'dopo',
    days: 'giorni',
    saved: 'Automazioni salvate',
    failed: 'Non è stato possibile salvare le automazioni',
    notifyHint: 'Ognuno può comunque disattivare questi avvisi per sé in Impostazioni › Notifiche.',
  },
  en: {
    title: 'Automations',
    description: 'Rules that work on their own, with no server: each PC checks them for the person using it and warns only once. They apply to the whole workspace.',
    urgent: 'Urgent task with no assignee',
    urgentHint: 'If a task with immediate priority stays unassigned, the admins get a notification.',
    question: 'Unanswered question',
    questionHint: 'If a question stays unanswered, whoever is @-mentioned in it gets a reminder.',
    due: 'Confirmed without a due date',
    dueHint: 'When someone confirms a task without a due date, the app asks them for one right away.',
    after: 'after',
    days: 'days',
    saved: 'Automations saved',
    failed: 'The automations could not be saved',
    notifyHint: 'Everyone can still turn these reminders off for themselves in Settings › Notifications.',
  },
})

/** Automazioni del workspace (amministratori). */
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()

const form = ref<Automations>(AutomationsSchema.parse({}))
watch(
  open,
  (o) => {
    if (o) form.value = structuredClone(ws.meta?.automations ?? AutomationsSchema.parse({}))
  },
  { immediate: true },
)
const clampDays = (v: string, max: number) => Math.min(max, Math.max(1, Math.round(Number(v) || 1)))

async function save() {
  const ok = await ws.setAutomations(AutomationsSchema.parse(form.value))
  ui.toast(ok ? m.saved : m.failed, ok ? 'success' : 'error')
  if (ok) open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div class="space-y-3 text-[13px]" data-automations>
      <section class="rounded-md border border-line p-3" data-rule="urgentUnassigned">
        <label class="flex items-center gap-2 font-semibold">
          <input v-model="form.urgentUnassigned.enabled" type="checkbox" class="accent-accent" />
          <Siren :size="14" class="text-p-immediata" /> {{ m.urgent }}
        </label>
        <p class="mt-1 pl-6 text-[12.5px] text-ink-2">{{ m.urgentHint }}</p>
        <p class="mt-2 flex items-center gap-1.5 pl-6 text-ink-2">
          {{ m.after }}
          <input
            type="number"
            min="1"
            max="30"
            class="h-7 w-16 rounded-md border border-line bg-surface px-2 tabular-nums disabled:opacity-50"
            :value="form.urgentUnassigned.days"
            :disabled="!form.urgentUnassigned.enabled"
            data-rule-days
            @change="form.urgentUnassigned.days = clampDays(($event.target as HTMLInputElement).value, 30)"
          />
          {{ m.days }}
        </p>
      </section>
      <section class="rounded-md border border-line p-3" data-rule="unansweredQuestion">
        <label class="flex items-center gap-2 font-semibold">
          <input v-model="form.unansweredQuestion.enabled" type="checkbox" class="accent-accent" />
          <CircleHelp :size="14" class="text-accent" /> {{ m.question }}
        </label>
        <p class="mt-1 pl-6 text-[12.5px] text-ink-2">{{ m.questionHint }}</p>
        <p class="mt-2 flex items-center gap-1.5 pl-6 text-ink-2">
          {{ m.after }}
          <input
            type="number"
            min="1"
            max="60"
            class="h-7 w-16 rounded-md border border-line bg-surface px-2 tabular-nums disabled:opacity-50"
            :value="form.unansweredQuestion.days"
            :disabled="!form.unansweredQuestion.enabled"
            data-rule-days
            @change="form.unansweredQuestion.days = clampDays(($event.target as HTMLInputElement).value, 60)"
          />
          {{ m.days }}
        </p>
      </section>
      <section class="rounded-md border border-line p-3" data-rule="confirmedNoDue">
        <label class="flex items-center gap-2 font-semibold">
          <input v-model="form.confirmedNoDue.enabled" type="checkbox" class="accent-accent" />
          <CalendarClock :size="14" class="text-p-alta" /> {{ m.due }}
        </label>
        <p class="mt-1 pl-6 text-[12.5px] text-ink-2">{{ m.dueHint }}</p>
      </section>
      <p class="text-[12px] text-ink-3">{{ m.notifyHint }}</p>
      <div class="flex justify-end gap-2 pt-1">
        <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
        <BaseButton variant="primary" data-automations-save @click="save">{{ common.actions.save }}</BaseButton>
      </div>
    </div>
  </BaseDialog>
</template>
