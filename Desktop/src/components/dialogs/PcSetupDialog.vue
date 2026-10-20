<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, CircleDashed, Download, Loader2, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useReadinessStore } from '@/stores/readiness'
import { getFs, isTauri } from '@/services/fs'
import { prereqsOf } from '@/services/readiness'
import { planPcSetup, type SetupInstall } from '@/services/pcSetup'
import { wingetAlreadyInstalled, wingetInstallCommand, wingetProgress } from '@/services/autoInstall'
import { currentOs } from '@/services/prereqCheck'
import { defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Configura questo PC',
    description: 'Tutti i programmi che servono ai tuoi progetti, in un solo passaggio: quello che serve a più progetti si installa una volta.',
    checking: 'Verifica dei progetti in corso…',
    recheck: 'Ricontrolla',
    projects: 'I tuoi progetti',
    ready: 'pronto',
    notChecked: 'da verificare',
    uncertain: (n: number) => `${n} da verificare a mano`,
    missingList: (l: string) => `manca: ${l}`,
    toInstall: 'Da installare',
    forProjects: (l: string) => `per ${l}`,
    version: (v: string) => `versione ${v}`,
    installAll: (n: number) => `Installa ${n === 1 ? 'il programma' : `i ${n} programmi`}`,
    installing: 'Installazione…',
    stop: 'Ferma',
    manual: 'Da installare a mano',
    manualHint: 'L’app non sa installarli da sola: apri lo Stack del progetto (con l’IA locale può cercare il pacchetto).',
    openStack: 'Apri lo Stack',
    allReady: (n: number) => `Questo PC ha tutto quello che serve ai tuoi ${n} ${plural(n, 'progetto', 'progetti')}.`,
    noPrereqs: 'Nessuno dei tuoi progetti indica prerequisiti nello Stack.',
    stepsHint: 'I passi di ogni progetto (es. scaricare il codice, npm install) restano nel suo Stack: «Gestisci configurazione automatica».',
    windowsOnly: 'L’installazione automatica usa winget ed è disponibile nell’app per Windows.',
    phase: { download: (p: number | null) => (p === null ? 'Scaricamento…' : `Scaricamento ${p}%`), verify: 'Verifica…', install: 'Installazione…', done: 'Installato', failed: (c: number) => `Non riuscito (codice ${c})`, waiting: 'In coda' },
    finished: 'Installazioni finite: ricontrollo i progetti.',
  },
  en: {
    title: 'Set up this PC',
    description: 'Every program your projects need, in one go: what several projects need is installed once.',
    checking: 'Checking the projects…',
    recheck: 'Check again',
    projects: 'Your projects',
    ready: 'ready',
    notChecked: 'not checked yet',
    uncertain: (n: number) => `${n} to check by hand`,
    missingList: (l: string) => `missing: ${l}`,
    toInstall: 'To install',
    forProjects: (l: string) => `for ${l}`,
    version: (v: string) => `version ${v}`,
    installAll: (n: number) => `Install ${n === 1 ? 'the program' : `the ${n} programs`}`,
    installing: 'Installing…',
    stop: 'Stop',
    manual: 'To install by hand',
    manualHint: 'The app cannot install these by itself: open the project Stack (with local AI it can look for the package).',
    openStack: 'Open the Stack',
    allReady: (n: number) => `This PC has everything your ${n} ${plural(n, 'project needs', 'projects need')}.`,
    noPrereqs: 'None of your projects lists prerequisites in its Stack.',
    stepsHint: 'Each project’s steps (e.g. getting the code, npm install) stay in its Stack: “Manage automatic setup”.',
    windowsOnly: 'Automatic installation uses winget and is available in the Windows app.',
    phase: { download: (p: number | null) => (p === null ? 'Downloading…' : `Downloading ${p}%`), verify: 'Verifying…', install: 'Installing…', done: 'Installed', failed: (c: number) => `Failed (code ${c})`, waiting: 'Queued' },
    finished: 'Installations finished: checking the projects again.',
  },
})

const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const rd = useReadinessStore()
const router = useRouter()

/** Progetti visibili con prerequisiti e il loro esito su questo PC. */
const rows = computed(() =>
  ws.visibleProjects
    .filter((p) => prereqsOf(p).length)
    .map((p) => ({ project: p, entry: rd.mine[p.id] ?? null }))
    .sort((a, b) => a.project.name.localeCompare(b.project.name)),
)
const plan = computed(() => planPcSetup(rows.value.filter((r) => r.entry).map((r) => ({ project: { id: r.project.id, name: r.project.name }, missing: r.entry!.missing }))))
const allReady = computed(() => rows.value.length > 0 && rows.value.every((r) => r.entry && !r.entry.missing.length))

watch(open, (v) => {
  if (!v || installing.value) return
  lastRun.value = null
  phases.value = {}
  message.value = ''
  if (!rd.running) void rd.runAll(true)
})

// --- installazione ---------------------------------------------------------------
type Phase = 'waiting' | 'download' | 'verify' | 'install' | 'done' | 'failed'
const phases = ref<Record<string, { phase: Phase; pct: number | null; code: number }>>({})
const installing = ref(false)
/** Le installazioni dell'ultimo giro restano in vista (con l'esito) anche quando non servono più. */
const lastRun = ref<SetupInstall[] | null>(null)
const shownInstalls = computed(() => lastRun.value ?? plan.value.installs)
const message = ref('')
let ctl: AbortController | null = null
const canInstall = () => (isTauri && currentOs() === 'windows') || typeof (window as unknown as { __pgmRun?: unknown }).__pgmRun === 'function'

function phaseText(id: string) {
  const s = phases.value[id]
  if (!s) return ''
  if (s.phase === 'download') return m.phase.download(s.pct)
  if (s.phase === 'failed') return m.phase.failed(s.code)
  return m.phase[s.phase]
}
function setPhase(id: string, patch: Partial<{ phase: Phase; pct: number | null; code: number }>) {
  const base = phases.value[id] ?? { phase: 'waiting' as Phase, pct: null, code: 0 }
  phases.value = { ...phases.value, [id]: { ...base, ...patch } }
}

async function installAll() {
  if (installing.value) return
  if (!canInstall()) {
    message.value = m.windowsOnly
    return
  }
  const list: SetupInstall[] = [...plan.value.installs]
  lastRun.value = list
  installing.value = true
  message.value = ''
  phases.value = {}
  for (const it of list) setPhase(it.plan.id, { phase: 'waiting' })
  ctl = new AbortController()
  const fs = await getFs()
  try {
    for (const it of list) {
      if (ctl.signal.aborted) break
      const command = wingetInstallCommand(it.plan)
      if (!command) {
        setPhase(it.plan.id, { phase: 'failed', code: -1 })
        continue
      }
      setPhase(it.plan.id, { phase: 'download' })
      const lines: string[] = []
      const code = await fs
        .runStream(command, {
          signal: ctl.signal,
          onLine: (l) => {
            lines.push(l)
            const g = wingetProgress(l)
            if (g.phase) setPhase(it.plan.id, { phase: g.phase, pct: g.phase === 'download' ? (g.pct ?? phases.value[it.plan.id]?.pct ?? null) : null })
          },
        })
        .catch(() => -1)
      setPhase(it.plan.id, code === 0 || wingetAlreadyInstalled(lines) ? { phase: 'done' } : { phase: 'failed', code })
    }
    message.value = m.finished
    await rd.runAll(true)
  } finally {
    installing.value = false
    ctl = null
    for (const [id, s] of Object.entries(phases.value)) if (s.phase !== 'done' && s.phase !== 'failed') setPhase(id, { phase: 'failed', code: -1 })
  }
}
function stop() {
  ctl?.abort()
}
function openStack(projectId: string) {
  open.value = false
  void router.push({ name: 'project', params: { id: projectId, section: 'stack' } })
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div class="space-y-5 text-[13px]" data-pc-setup>
      <p v-if="!rows.length" class="text-ink-3">{{ m.noPrereqs }}</p>
      <template v-else>
        <section>
          <div class="mb-1.5 flex items-center gap-2">
            <h3 class="flex-1 font-semibold">{{ m.projects }}</h3>
            <span v-if="rd.running" class="flex items-center gap-1 text-[12px] text-ink-3"><Loader2 :size="12" class="animate-spin" /> {{ m.checking }}</span>
            <BaseButton v-else size="sm" variant="ghost" :disabled="installing" @click="rd.runAll(true)"><RefreshCw :size="12" /> {{ m.recheck }}</BaseButton>
          </div>
          <ul class="divide-y divide-line rounded-md border border-line">
            <li v-for="r in rows" :key="r.project.id" class="flex items-center gap-2 px-3 py-2" :data-pc-project="r.project.name">
              <CheckCircle2 v-if="r.entry && !r.entry.missing.length" :size="15" class="shrink-0 text-ok" />
              <TriangleAlert v-else-if="r.entry" :size="15" class="shrink-0 text-p-alta" />
              <CircleDashed v-else :size="15" class="shrink-0 text-ink-3" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ r.project.name }}</span>
              <span class="shrink-0 text-[12px]" :class="r.entry?.missing.length ? 'text-p-alta' : 'text-ink-3'">
                <template v-if="!r.entry">{{ m.notChecked }}</template>
                <template v-else-if="r.entry.missing.length">{{ m.missingList(r.entry.missing.map((x) => x.name).join(', ')) }}</template>
                <template v-else>{{ m.ready }}<template v-if="r.entry.uncertain"> · {{ m.uncertain(r.entry.uncertain) }}</template></template>
              </span>
            </li>
          </ul>
        </section>

        <p v-if="allReady" class="flex items-center gap-2 rounded-md bg-ok/10 px-3 py-2 font-medium text-ok" data-pc-ready>
          <CheckCircle2 :size="15" /> {{ m.allReady(rows.length) }}
        </p>

        <section v-if="shownInstalls.length">
          <h3 class="mb-1.5 font-semibold">{{ m.toInstall }}</h3>
          <ul class="divide-y divide-line rounded-md border border-line">
            <li v-for="it in shownInstalls" :key="it.plan.id" class="flex items-center gap-3 px-3 py-2" :data-pc-install="it.plan.id">
              <div class="min-w-0 flex-1">
                <p class="font-medium">{{ it.name }} <span class="font-mono text-[11.5px] font-normal text-ink-3">{{ it.plan.id }}</span></p>
                <p class="truncate text-[12px] text-ink-3">{{ m.forProjects(it.projects.map((p) => p.name).join(', ')) }}</p>
              </div>
              <span v-if="phases[it.plan.id]" class="shrink-0 text-[12px] font-medium" :class="phases[it.plan.id]!.phase === 'done' ? 'text-ok' : phases[it.plan.id]!.phase === 'failed' ? 'text-danger' : 'text-ink-2'" data-pc-phase :data-phase="phases[it.plan.id]!.phase">
                {{ phaseText(it.plan.id) }}
              </span>
            </li>
          </ul>
        </section>

        <section v-if="plan.manual.length" data-pc-manual>
          <h3 class="font-semibold">{{ m.manual }}</h3>
          <p class="mb-1.5 text-[12px] text-ink-3">{{ m.manualHint }}</p>
          <ul class="divide-y divide-line rounded-md border border-line">
            <li v-for="x in plan.manual" :key="x.name" class="flex items-center gap-3 px-3 py-2">
              <div class="min-w-0 flex-1">
                <p class="font-medium">{{ x.name }}<span v-if="x.required.filter(Boolean).length" class="font-normal text-ink-3"> · {{ m.version(x.required.filter(Boolean).join(', ')) }}</span></p>
                <p class="truncate text-[12px] text-ink-3">{{ m.forProjects(x.projects.map((p) => p.name).join(', ')) }}</p>
              </div>
              <BaseButton size="sm" variant="ghost" @click="openStack(x.projects[0]!.id)">{{ m.openStack }}</BaseButton>
            </li>
          </ul>
        </section>

        <p v-if="message" class="text-[12.5px] text-ink-2" data-pc-message>{{ message }}</p>
        <p class="text-[12px] text-ink-3">{{ m.stepsHint }}</p>
      </template>
    </div>
    <template #footer>
      <BaseButton v-if="installing" variant="ghost" @click="stop">{{ m.stop }}</BaseButton>
      <BaseButton v-if="plan.installs.length" variant="primary" :disabled="installing || rd.running" data-pc-install-all @click="installAll">
        <Loader2 v-if="installing" :size="14" class="animate-spin" /><Download v-else :size="14" />
        {{ installing ? m.installing : m.installAll(plan.installs.length) }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
