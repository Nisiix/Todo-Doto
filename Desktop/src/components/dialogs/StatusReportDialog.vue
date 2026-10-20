<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ClipboardCopy, Download, Loader2, Mail, Sparkles } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useAiStore, withAi } from '@/stores/ai'
import { useToday } from '@/composables/useToday'
import { getFs } from '@/services/fs'
import { mailtoLink } from '@/services/office'
import { weeklySummary } from '@/services/aiAssist'
import { buildReportHtml, reportFacts, reportMarkdown, toWeekFacts } from '@/services/statusReport'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Rapporto di stato',
    description: 'Per uso interno: cosa si è fatto nel periodo, cosa è in ritardo, cosa arriva, tappe, decisioni, domande aperte e attenzioni. Si copia, si salva come pagina (da stampare in PDF) o si manda per email.',
    period: 'Periodo',
    last7: 'Ultimi 7 giorni',
    last14: 'Ultimi 14 giorni',
    last30: 'Ultimi 30 giorni',
    custom: 'Scegli le date',
    from: 'Dal',
    to: 'Al',
    intro: 'Introduzione (facoltativa)',
    introPlaceholder: 'Due righe sul periodo…',
    aiIntro: 'Scrivila con l’IA',
    aiHint: 'L’IA locale scrive un paragrafo partendo solo dai fatti del rapporto',
    aiFailed: 'L’IA locale non ha risposto: riprova o scrivi l’introduzione a mano',
    preview: 'Anteprima del rapporto',
    copy: 'Copia in Markdown',
    copied: 'Rapporto copiato',
    save: 'Salva la pagina',
    saveTitle: 'Salva il rapporto di stato',
    saved: 'Rapporto salvato: aprilo e stampalo in PDF se serve',
    open: 'Apri',
    mail: 'Invia per email',
    subject: (p: string, a: string, b: string) => `Rapporto di stato · ${p} · ${a}–${b}`,
  },
  en: {
    title: 'Status report',
    description: 'For internal use: what was done in the period, what is overdue, what is coming, milestones, decisions, open questions and attention points. Copy it, save it as a page (to print to PDF) or send it by email.',
    period: 'Period',
    last7: 'Last 7 days',
    last14: 'Last 14 days',
    last30: 'Last 30 days',
    custom: 'Pick the dates',
    from: 'From',
    to: 'To',
    intro: 'Introduction (optional)',
    introPlaceholder: 'A couple of lines about the period…',
    aiIntro: 'Write it with AI',
    aiHint: 'The local AI writes a paragraph using only the report’s facts',
    aiFailed: 'The local AI did not answer: try again or write the introduction yourself',
    preview: 'Report preview',
    copy: 'Copy as Markdown',
    copied: 'Report copied',
    save: 'Save the page',
    saveTitle: 'Save the status report',
    saved: 'Report saved: open it and print to PDF if needed',
    open: 'Open',
    mail: 'Send by email',
    subject: (p: string, a: string, b: string) => `Status report · ${p} · ${a}–${b}`,
  },
})

const props = defineProps<{ project: Project }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const ai = useAiStore()
const { today } = useToday()

const preset = ref<'7' | '14' | '30' | 'custom'>('7')
const from = ref('')
const to = ref('')
const intro = ref('')
watch(open, (o) => {
  if (!o) return
  preset.value = '7'
  intro.value = ''
})
watch(
  [preset, open, today],
  () => {
    if (preset.value === 'custom') return
    to.value = today.value
    from.value = dayjs(today.value).subtract(Number(preset.value) - 1, 'day').format('YYYY-MM-DD')
  },
  { immediate: true },
)

const facts = computed(() =>
  reportFacts(props.project, from.value <= to.value ? from.value : to.value, from.value <= to.value ? to.value : from.value, today.value, {
    userIds: ws.users.map((u) => u.id),
    absences: Object.fromEntries(ws.users.map((u) => [u.id, u.absences])),
  }),
)
const ctx = { userName: ws.userName }
const html = computed(() => buildReportHtml(facts.value, ctx, intro.value))
const markdown = computed(() => reportMarkdown(facts.value, ctx, intro.value))

const writing = ref(false)
async function aiIntro() {
  writing.value = true
  try {
    const r = await withAi((cfg) => weeklySummary(cfg, toWeekFacts(facts.value)))
    if (r) intro.value = r.summary
    else ui.toast(m.aiFailed, 'warning', undefined, 5000)
  } catch {
    ui.toast(m.aiFailed, 'warning', undefined, 5000)
  } finally {
    writing.value = false
  }
}

async function copy() {
  await navigator.clipboard.writeText(markdown.value)
  ui.toast(m.copied, 'success', undefined, 2500)
}
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'progetto'
async function save() {
  const fs = await getFs()
  const path = await fs.saveFile(`rapporto-${slug(props.project.name)}-${facts.value.to}.html`, m.saveTitle)
  if (!path) return
  await fs.writeTextAtomic(path, html.value)
  ui.toast(m.saved, 'success', { label: m.open, run: () => void fs.openExternal(path, 'file') }, 8000)
}
async function mail() {
  const subject = m.subject(props.project.name, dayjs(facts.value.from).format('D/M'), dayjs(facts.value.to).format('D/M'))
  await (await getFs()).openExternal(mailtoLink([], subject, markdown.value), 'link')
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="xl">
    <div class="flex gap-5" data-status-report>
      <div class="w-72 shrink-0 space-y-3 text-[13px]">
        <div>
          <label class="mb-1 block font-medium" for="sr-period">{{ m.period }}</label>
          <select id="sr-period" v-model="preset" class="field" data-sr-period>
            <option value="7">{{ m.last7 }}</option>
            <option value="14">{{ m.last14 }}</option>
            <option value="30">{{ m.last30 }}</option>
            <option value="custom">{{ m.custom }}</option>
          </select>
        </div>
        <div v-if="preset === 'custom'" class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-[12px] text-ink-3">{{ m.from }}<input v-model="from" type="date" class="field field-sm" data-sr-from /></label>
          <label class="flex flex-col gap-1 text-[12px] text-ink-3">{{ m.to }}<input v-model="to" type="date" class="field field-sm" data-sr-to /></label>
        </div>
        <div>
          <label for="sr-intro" class="mb-1 block font-medium">{{ m.intro }}</label>
          <textarea id="sr-intro" v-model="intro" rows="5" class="field resize-y" :placeholder="m.introPlaceholder" data-sr-intro />
          <BaseButton v-if="ai.active" size="sm" variant="ghost" class="mt-1" :title="m.aiHint" :disabled="writing" data-sr-ai @click="aiIntro()">
            <Loader2 v-if="writing" :size="13" class="animate-spin" /><Sparkles v-else :size="13" /> {{ m.aiIntro }}
          </BaseButton>
        </div>
      </div>
      <iframe :srcdoc="html" sandbox="" class="h-[62vh] min-w-0 flex-1 rounded-md border border-line bg-white" :title="m.preview" data-sr-preview />
    </div>
    <template #footer>
      <BaseButton variant="ghost" class="mr-auto" data-sr-mail @click="mail()"><Mail :size="14" /> {{ m.mail }}</BaseButton>
      <BaseButton variant="ghost" data-sr-copy @click="copy()"><ClipboardCopy :size="14" /> {{ m.copy }}</BaseButton>
      <BaseButton variant="primary" data-sr-save @click="save()"><Download :size="14" /> {{ m.save }}</BaseButton>
    </template>
  </BaseDialog>
</template>
