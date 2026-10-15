import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { checkPrerequisite } from '@/composables/usePrereqChecks'
import { currentOs, type CheckResult } from '@/services/prereqCheck'
import { buildEntry, missingSignature, prereqsOf, sameEntry } from '@/services/readiness'
import { useWorkspaceStore } from './workspace'
import { useNotificationsStore } from './notifications'
import { useSessionStore } from './session'
import type { Project, ReadinessEntry, ReadinessFile, ReadinessMissing } from '@/types'
import { defineMessages } from '@/i18n'

const M = defineMessages({
  it: {
    missing: (x: ReadinessMissing) =>
      x.status === 'missing' ? `${x.name} non installato` : `${x.name} ${x.found || ''} da aggiornare${x.required ? ` (serve ${x.required})` : ''}`.replace('  ', ' '),
    text: (list: string) => `Configurazione incompleta su questo PC: ${list}. Apri lo Stack del progetto per sistemarla.`,
  },
  en: {
    missing: (x: ReadinessMissing) =>
      x.status === 'missing' ? `${x.name} not installed` : `${x.name} ${x.found || ''} to update${x.required ? ` (needs ${x.required})` : ''}`.replace('  ', ' '),
    text: (list: string) => `Incomplete setup on this PC: ${list}. Open the project Stack to fix it.`,
  },
})

/** Dopo quanto la verifica in background si ripete tornando sulla finestra. */
const RECHECK_MS = 30 * 60_000
/** Un esito uguale si riscrive comunque dopo questo tempo, così non risulta vecchio. */
const REFRESH_SAME_MS = 7 * 86_400_000

/**
 * Configurazione dei PC: verifica dei prerequisiti di tutti i progetti visibili
 * (all'apertura e periodicamente), esito condiviso con gli altri nei workspace
 * di rete, notifica locale quando a questo PC manca qualcosa per un progetto.
 * Si eseguono solo i comandi sicuri (richieste di versione): quelli
 * personalizzati restano da confermare nello Stack.
 */
export const useReadinessStore = defineStore('readiness', () => {
  const ws = useWorkspaceStore()
  const notif = useNotificationsStore()
  const session = useSessionStore()
  const os = currentOs()

  const running = ref(false)
  /** Esiti di questo PC, per progetto (in memoria; quelli pubblicati sono in ws.readiness). */
  const mine = ref<Record<string, ReadinessEntry>>({})
  let lastRun = 0

  /** Registra l'esito di un progetto e, se manca qualcosa, avvisa (una volta per mancanza). */
  function record(p: Project, entry: ReadinessEntry) {
    mine.value = { ...mine.value, [p.id]: entry }
    if (entry.missing.length) {
      notif.notifySystem({
        key: `setup:${p.id}:${missingSignature(entry)}`,
        type: 'setup_incomplete',
        projectId: p.id,
        projectName: p.name,
        itemId: null,
        itemTitle: '',
        text: M.text(entry.missing.map(M.missing).join(', ')),
      })
    } else {
      // Sistemato: se in futuro mancherà di nuovo qualcosa, si avviserà ancora
      notif.forgetKeys(`setup:${p.id}:`)
    }
  }

  /** Pubblica gli esiti di questo PC (solo in rete, e solo se qualcosa è cambiato). */
  async function publish() {
    const me = ws.currentUser
    if (!me || !ws.isNetwork) return
    const prev = ws.readiness[me.id]
    const projects: ReadinessFile['projects'] = {}
    // Si tengono gli esiti precedenti dei progetti che esistono ancora e non sono stati riverificati
    for (const [id, e] of Object.entries(prev?.projects ?? {})) if (ws.projects[id]) projects[id] = e
    let changed = !prev || prev.host !== session.identity.hostname
    for (const [id, e] of Object.entries(mine.value)) {
      if (!ws.projects[id]) continue
      const old = prev?.projects[id]
      if (sameEntry(old, e) && Date.now() - Date.parse(old!.checkedAt) < REFRESH_SAME_MS) continue
      projects[id] = e
      changed = true
    }
    if (prev && Object.keys(prev.projects).some((id) => !ws.projects[id])) changed = true
    if (!changed) return
    await ws.writeMyReadiness({ userId: me.id, host: session.identity.hostname, os, updatedAt: new Date().toISOString(), projects })
  }

  async function checkProject(p: Project, force: boolean): Promise<ReadinessEntry | null> {
    const prereqs = prereqsOf(p)
    const results: Record<string, CheckResult> = {}
    for (const pr of prereqs) results[pr.id] = await checkPrerequisite(pr, os, force)
    return buildEntry(prereqs, results)
  }

  /** Verifica tutti i progetti visibili con prerequisiti (in sequenza, in background). */
  async function runAll(force = false) {
    if (running.value || ws.status !== 'open') return
    running.value = true
    lastRun = Date.now()
    try {
      for (const p of ws.visibleProjects) {
        if (!prereqsOf(p).length) continue
        const entry = await checkProject(p, force)
        if (ws.status !== 'open') return
        if (entry) record(p, entry)
      }
      await publish()
    } finally {
      running.value = false
    }
  }

  /** Esiti appena calcolati dallo Stack (chi sta configurando il PC li vede subito condivisi). */
  async function report(p: Project, results: Record<string, CheckResult | undefined>) {
    const entry = buildEntry(prereqsOf(p), results)
    if (!entry) return
    record(p, entry)
    await publish()
  }

  function reset() {
    mine.value = {}
    lastRun = 0
  }

  // All'apertura del workspace (con un attimo di ritardo, per non rallentare la partenza)
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => ws.status === 'open' && ws.meta?.id,
    (openId) => {
      if (timer) clearTimeout(timer)
      timer = null
      reset()
      if (openId) timer = setTimeout(() => void runAll(), 1500)
    },
    { immediate: true },
  )
  // Di ritorno sulla finestra, se è passato un po' (magari è stato installato qualcosa)
  useEventListener(window, 'focus', () => {
    if (ws.status === 'open' && Date.now() - lastRun > RECHECK_MS) void runAll(true)
  })

  return { running, mine, runAll, report, publish, reset }
})
