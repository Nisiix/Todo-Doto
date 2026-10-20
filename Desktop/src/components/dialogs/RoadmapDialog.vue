<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download, Mail, Send } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
import { buildRoadmapHtml, defaultRoadmapOptions, roadmapSections, roadmapText, type RoadmapOptions } from '@/services/roadmap'
import { isEmail, mailtoLink } from '@/services/office'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Roadmap per il cliente',
    description: 'Una pagina da mandare al cliente con lo stato del progetto: cosa è fatto e cosa arriva. Niente descrizioni, commenti, domande o allegati.',
    heading: 'Titolo',
    intro: 'Introduzione',
    introPlaceholder: 'Due righe per il cliente (facoltative)',
    showDone: 'Mostra i completati',
    doneRange: 'Completati',
    last30: 'ultimi 30 giorni',
    last90: 'ultimi 3 mesi',
    all: 'tutti',
    showUndated: 'Mostra le attività senza data',
    showAssignees: 'Mostra chi se ne occupa',
    includeTriage: 'Includi le idee «da valutare»',
    labels: 'Solo queste etichette',
    allLabels: 'Tutte le etichette',
    counts: (p: number, u: number, d: number) => `${p} pianificate · ${u} senza data · ${d} completate`,
    save: 'Salva la pagina…',
    saveTitle: 'Salva la roadmap',
    saved: 'Roadmap salvata. Per un PDF: aprila e stampa in PDF.',
    open: 'Apri',
    preview: 'Anteprima della roadmap',
    mail: 'Invia per email',
    mailHint: 'Apre il programma di posta con la roadmap in testo',
    sendTo: 'Invia al cliente',
    sendToPlaceholder: 'email del cliente',
    subject: (p: string) => `Roadmap · ${p}`,
    sent: 'Roadmap inviata.',
    sendFailed: 'Invio non riuscito: controlla Impostazioni › Email e Teams.',
    invalid: 'Indirizzo email non valido.',
  },
  en: {
    title: 'Client roadmap',
    description: 'A page to send to the client with the state of the project: what is done and what is coming. No descriptions, comments, questions or attachments.',
    heading: 'Title',
    intro: 'Introduction',
    introPlaceholder: 'A couple of lines for the client (optional)',
    showDone: 'Show completed tasks',
    doneRange: 'Completed',
    last30: 'last 30 days',
    last90: 'last 3 months',
    all: 'all',
    showUndated: 'Show tasks without a date',
    showAssignees: 'Show who is in charge',
    includeTriage: 'Include ideas “to evaluate”',
    labels: 'Only these labels',
    allLabels: 'All labels',
    counts: (p: number, u: number, d: number) => `${p} planned · ${u} undated · ${d} completed`,
    save: 'Save the page…',
    saveTitle: 'Save the roadmap',
    saved: 'Roadmap saved. For a PDF: open it and print to PDF.',
    open: 'Open',
    preview: 'Roadmap preview',
    mail: 'Send by email',
    mailHint: 'Opens the mail program with the roadmap as text',
    sendTo: 'Send to the client',
    sendToPlaceholder: 'client email',
    subject: (p: string) => `Roadmap · ${p}`,
    sent: 'Roadmap sent.',
    sendFailed: 'Sending failed: check Settings › Email and Teams.',
    invalid: 'Invalid email address.',
  },
})

/**
 * Anteprima e opzioni della roadmap per il cliente; si salva come pagina
 * HTML autonoma dove sceglie l'utente (nessuna scrittura automatica).
 */
const props = defineProps<{ project: Project }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()

const opts = ref<RoadmapOptions>(defaultRoadmapOptions(props.project))
watch(open, (v) => {
  if (v) opts.value = defaultRoadmapOptions(props.project)
})
const usedLabels = computed(() => {
  const ids = new Set(props.project.items.filter((i) => i.bucket !== 'trash' && i.labelId).map((i) => i.labelId!))
  return ws.tree.labels.filter((l) => ids.has(l.id))
})
function toggleLabel(id: string, on: boolean) {
  const set = new Set(opts.value.labelIds)
  if (on) set.add(id)
  else set.delete(id)
  opts.value.labelIds = [...set]
}
const doneRange = computed({
  get: () => String(opts.value.doneSinceDays ?? 'all'),
  set: (v: string) => (opts.value.doneSinceDays = v === 'all' ? null : Number(v)),
})

const html = computed(() => buildRoadmapHtml(props.project, opts.value, { labels: ws.labelsById, userName: ws.userName }))
const counts = computed(() => {
  const s = roadmapSections(props.project, opts.value)
  return m.counts(s.planned.length, s.undated.length, s.done.length)
})

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'progetto'

const ctx = () => ({ labels: ws.labelsById, userName: ws.userName })
async function mailText() {
  const title = opts.value.title.trim() || props.project.name
  await (await getFs()).openExternal(mailtoLink([], m.subject(title), roadmapText(props.project, opts.value, ctx())), 'link')
}
/** Con il metodo di invio del workspace (Outlook o SMTP) la roadmap parte come pagina HTML. */
const canSend = computed(() => ws.isNetwork && (ws.meta?.mail.method ?? 'off') !== 'off')
const clientEmail = ref('')
const sending = ref(false)
async function sendToClient() {
  const to = clientEmail.value.split(/[,;\s]+/).filter(Boolean)
  if (!to.length || !to.every(isEmail)) return ui.toast(m.invalid, 'warning')
  sending.value = true
  try {
    const title = opts.value.title.trim() || props.project.name
    const ok = await ws.sendMail({ to, subject: m.subject(title), html: html.value, text: roadmapText(props.project, opts.value, ctx()) })
    ui.toast(ok === true ? m.sent : m.sendFailed, ok === true ? 'success' : 'error', undefined, 6000)
  } finally {
    sending.value = false
  }
}

async function save() {
  const fs = await getFs()
  const path = await fs.saveFile(`roadmap-${slug(props.project.name)}.html`, m.saveTitle)
  if (!path) return
  await fs.writeTextAtomic(path, html.value)
  ui.toast(m.saved, 'success', { label: m.open, run: () => void fs.openExternal(path, 'file') }, 8000)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="xl">
    <div class="flex gap-5" data-roadmap>
      <div class="w-72 shrink-0 space-y-3 text-[13px]">
        <div>
          <label for="rm-title" class="mb-1 block font-medium">{{ m.heading }}</label>
          <input id="rm-title" v-model="opts.title" class="field" data-autofocus />
        </div>
        <div>
          <label for="rm-intro" class="mb-1 block font-medium">{{ m.intro }}</label>
          <textarea id="rm-intro" v-model="opts.intro" rows="3" class="field resize-none" :placeholder="m.introPlaceholder" />
        </div>
        <label class="flex items-center gap-2"><input v-model="opts.showDone" type="checkbox" class="accent-accent" data-rm-done /> {{ m.showDone }}</label>
        <div v-if="opts.showDone" class="flex items-center gap-2 pl-6">
          <span class="text-ink-2">{{ m.doneRange }}</span>
          <select v-model="doneRange" class="field !h-8 !w-auto !py-0">
            <option value="30">{{ m.last30 }}</option>
            <option value="90">{{ m.last90 }}</option>
            <option value="all">{{ m.all }}</option>
          </select>
        </div>
        <label class="flex items-center gap-2"><input v-model="opts.showUndated" type="checkbox" class="accent-accent" /> {{ m.showUndated }}</label>
        <label class="flex items-center gap-2"><input v-model="opts.showAssignees" type="checkbox" class="accent-accent" data-rm-assignees /> {{ m.showAssignees }}</label>
        <label class="flex items-center gap-2"><input v-model="opts.includeTriage" type="checkbox" class="accent-accent" /> {{ m.includeTriage }}</label>
        <fieldset v-if="usedLabels.length" class="space-y-1.5">
          <legend class="mb-1 font-medium">{{ m.labels }}</legend>
          <label v-for="l in usedLabels" :key="l.id" class="flex items-center gap-2">
            <input type="checkbox" class="accent-accent" :checked="opts.labelIds.includes(l.id)" @change="toggleLabel(l.id, ($event.target as HTMLInputElement).checked)" />
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: l.color }" /> {{ l.name }}
          </label>
          <p v-if="!opts.labelIds.length" class="text-[12px] text-ink-3">{{ m.allLabels }}</p>
        </fieldset>
        <p class="border-t border-line pt-3 text-[12px] text-ink-3" data-rm-counts>{{ counts }}</p>
      </div>
      <iframe :srcdoc="html" sandbox="" class="h-[62vh] min-w-0 flex-1 rounded-md border border-line bg-white" :title="m.preview" data-rm-preview />
    </div>
    <template #footer>
      <div v-if="canSend" class="mr-auto flex items-center gap-2">
        <input v-model="clientEmail" type="email" class="field !h-8 w-56" :placeholder="m.sendToPlaceholder" data-rm-client />
        <BaseButton :disabled="sending || !clientEmail.trim()" data-rm-send @click="sendToClient"><Send :size="14" /> {{ m.sendTo }}</BaseButton>
      </div>
      <BaseButton variant="ghost" :title="m.mailHint" data-rm-mail @click="mailText"><Mail :size="14" /> {{ m.mail }}</BaseButton>
      <BaseButton variant="primary" data-rm-save @click="save"><Download :size="14" /> {{ m.save }}</BaseButton>
    </template>
  </BaseDialog>
</template>
