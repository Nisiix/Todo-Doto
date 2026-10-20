<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessagesSquare, Send } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { isTeamsWebhook, postTeams } from '@/services/office'
import { TEAMS_EVENTS, type TeamsEvent } from '@/services/mail'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Canale Microsoft Teams',
    lead: 'Le novità del progetto arrivano in un canale di Teams. In Teams: «…» del canale › Workflow › «Pubblica in un canale quando viene ricevuta una richiesta webhook», poi incolla qui l’indirizzo che ti dà.',
    url: 'Indirizzo del Workflow',
    invalid: 'Non è un indirizzo di un Workflow di Teams (https://…logic.azure.com/… o …powerplatform.com/…).',
    events: { item_created: 'Task creati', item_completed: 'Task completati', assigned: 'Assegnazioni', question: 'Domande', mention: 'Menzioni' } as Record<TeamsEvent, string>,
    eventsHint: 'Ogni messaggio lo invia il PC di chi fa la modifica: titolo del task, progetto, chi e cosa. Mai descrizioni o allegati.',
    save: 'Salva',
    saved: 'Canale Teams salvato.',
    remove: 'Scollega',
    removed: 'Canale Teams scollegato.',
    test: 'Invia una prova',
    testOk: 'Messaggio di prova inviato: controlla il canale.',
    testFailed: 'Invio non riuscito: controlla l’indirizzo e la connessione a Internet.',
    testText: (p: string) => `Todo Doto: il progetto «${p}» è collegato a questo canale.`,
    connected: 'Collegato a un canale Teams.',
    notConnected: 'Nessun canale Teams collegato.',
    adminOnly: 'Lo collega un amministratore.',
  },
  en: {
    title: 'Microsoft Teams channel',
    lead: 'Project news arrive in a Teams channel. In Teams: the channel “…” › Workflows › “Post to a channel when a webhook request is received”, then paste here the address it gives you.',
    url: 'Workflow address',
    invalid: 'Not a Teams Workflow address (https://…logic.azure.com/… or …powerplatform.com/…).',
    events: { item_created: 'Tasks created', item_completed: 'Tasks completed', assigned: 'Assignments', question: 'Questions', mention: 'Mentions' } as Record<TeamsEvent, string>,
    eventsHint: 'Each message is sent by the PC of whoever makes the change: task title, project, who and what. Never descriptions or attachments.',
    save: 'Save',
    saved: 'Teams channel saved.',
    remove: 'Disconnect',
    removed: 'Teams channel disconnected.',
    test: 'Send a test',
    testOk: 'Test message sent: check the channel.',
    testFailed: 'Sending failed: check the address and the Internet connection.',
    testText: (p: string) => `Todo Doto: the project “${p}” is connected to this channel.`,
    connected: 'Connected to a Teams channel.',
    notConnected: 'No Teams channel connected.',
    adminOnly: 'An administrator connects it.',
  },
})

/** Stack del progetto: canale Teams per le novità (solo workspace di rete). */
const props = defineProps<{ project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const ui = useUiStore()

const url = ref('')
const events = ref<TeamsEvent[]>([])
watch(
  () => props.project.teams,
  (t) => {
    url.value = t?.url ?? ''
    events.value = [...(t?.events ?? ['item_completed', 'assigned', 'question', 'mention'])]
  },
  { immediate: true },
)
const valid = computed(() => isTeamsWebhook(url.value))
const dirty = computed(() => url.value.trim() !== (props.project.teams?.url ?? '') || events.value.slice().sort().join() !== (props.project.teams?.events ?? []).slice().sort().join())

async function save() {
  if (!valid.value) return
  await ws.setProjectTeams(props.project.id, { url: url.value.trim(), events: events.value })
  ui.toast(m.saved, 'success')
}
async function remove() {
  await ws.setProjectTeams(props.project.id, null)
  ui.toast(m.removed, 'info')
}
const testing = ref(false)
async function test() {
  testing.value = true
  try {
    const ok = await postTeams(url.value, { type: 'AdaptiveCard', version: '1.4', body: [{ type: 'TextBlock', text: m.testText(props.project.name), wrap: true }] }).catch(() => false)
    ui.toast(ok ? m.testOk : m.testFailed, ok ? 'success' : 'error', undefined, 6000)
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <section v-if="ws.isNetwork" class="max-w-3xl" data-project-teams>
    <h2 class="mb-1 flex items-center gap-2 text-[15px] font-bold tracking-tight"><MessagesSquare :size="16" /> {{ m.title }}</h2>
    <template v-if="ws.isAdmin && !readOnly">
      <p class="mb-3 text-[12.5px] leading-snug text-ink-2">{{ m.lead }}</p>
      <label for="pt-url" class="mb-1 block text-[12.5px] font-medium">{{ m.url }}</label>
      <input id="pt-url" v-model="url" class="field font-mono text-[12px]" placeholder="https://…logic.azure.com/workflows/…" data-teams-url />
      <p v-if="url.trim() && !valid" class="mt-1 text-[12px] text-danger" data-teams-invalid>{{ m.invalid }}</p>
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <label v-for="e in TEAMS_EVENTS" :key="e" class="flex items-center gap-2 text-[13px]">
          <input v-model="events" type="checkbox" class="accent-accent" :value="e" /> {{ m.events[e] }}
        </label>
      </div>
      <p class="mt-1.5 text-[12px] text-ink-3">{{ m.eventsHint }}</p>
      <div class="mt-3 flex gap-2">
        <BaseButton v-if="dirty" size="sm" variant="primary" :disabled="!valid || !events.length" data-teams-save @click="save">{{ m.save }}</BaseButton>
        <BaseButton v-if="valid" size="sm" :disabled="testing" @click="test"><Send :size="13" /> {{ m.test }}</BaseButton>
        <BaseButton v-if="project.teams" size="sm" variant="ghost" class="ml-auto" @click="remove">{{ m.remove }}</BaseButton>
      </div>
    </template>
    <p v-else class="text-[12.5px] text-ink-3">{{ project.teams ? m.connected : m.notConnected }} {{ m.adminOnly }}</p>
  </section>
</template>
