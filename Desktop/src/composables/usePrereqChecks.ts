import { computed, ref, watch, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { getFs, isTauri, type CheckOutput } from '@/services/fs'
import { currentOs, interpretCheck, planCheck, precheck, type CheckResult } from '@/services/prereqCheck'
import type { Prerequisite } from '@/types'

/** Esiti dei comandi già eseguiti, condivisi fra i progetti (stesso comando ⇒ stesso esito). */
const cache = new Map<string, { at: number; run: Promise<CheckOutput> }>()
const CACHE_MS = 60_000
/** Comandi personalizzati che l'utente ha confermato in questa sessione. */
const confirmedCommands = ref(new Set<string>())
const TIMEOUT_MS = 20_000
/** Comandi eseguiti insieme, al massimo. */
const PARALLEL = 4

function runCached(command: string, force: boolean): Promise<CheckOutput> {
  const hit = cache.get(command)
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.run
  const run = getFs().then((fs) => fs.runCheck(command, TIMEOUT_MS))
  cache.set(command, { at: Date.now(), run })
  run.catch(() => cache.delete(command))
  return run
}

/**
 * Verifica automatica dei prerequisiti di uno stack sul PC di chi lo apre:
 * esegue i controlli all'apertura, quando cambiano i prerequisiti e quando si
 * torna sulla finestra (es. dopo aver installato qualcosa).
 */
export function usePrereqChecks(prereqs: Ref<Prerequisite[]>) {
  const os = currentOs()
  const results = ref<Record<string, CheckResult>>({})
  const checking = ref(new Set<string>())
  let generation = 0

  async function checkOne(p: Prerequisite, force: boolean, gen: number) {
    const plan = planCheck(p, os)
    const pre = precheck(plan, os, { desktop: isTauri || hasFakeChecks(), confirmed: confirmedCommands.value.has(plan.command) })
    if (pre) {
      results.value = { ...results.value, [p.id]: pre }
      return
    }
    checking.value = new Set(checking.value).add(p.id)
    let result: CheckResult
    try {
      result = interpretCheck(await runCached(plan.command, force), plan, p.version)
    } catch (e) {
      result = { status: 'failed', version: '', command: plan.command, output: e instanceof Error ? e.message : String(e) }
    }
    if (gen !== generation) return
    results.value = { ...results.value, [p.id]: result }
    const next = new Set(checking.value)
    next.delete(p.id)
    checking.value = next
  }

  /** Verifica tutti i prerequisiti (con `force` senza usare gli esiti recenti). */
  async function checkAll(force = false) {
    const gen = ++generation
    const list = [...prereqs.value]
    // Gli esiti di prerequisiti tolti non servono più
    const ids = new Set(list.map((p) => p.id))
    results.value = Object.fromEntries(Object.entries(results.value).filter(([id]) => ids.has(id)))
    checking.value = new Set()
    let i = 0
    const worker = async () => {
      while (i < list.length && gen === generation) await checkOne(list[i++]!, force, gen)
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker))
  }

  /** Esegue un comando personalizzato dopo la conferma dell'utente. */
  async function confirmAndCheck(p: Prerequisite) {
    confirmedCommands.value = new Set(confirmedCommands.value).add(planCheck(p, os).command)
    await checkOne(p, true, generation)
  }

  watch(
    () => prereqs.value.map((p) => `${p.id}|${p.name}|${p.version}|${p.check}`).join('\n'),
    () => void checkAll(),
    { immediate: true },
  )
  // Di ritorno sulla finestra (magari dopo un'installazione) si ricontrolla ciò che non andava
  let lastFocus = 0
  useEventListener(window, 'focus', () => {
    if (Date.now() - lastFocus < 5_000) return
    lastFocus = Date.now()
    const pending = prereqs.value.some((p) => {
      const s = results.value[p.id]?.status
      return s && s !== 'ok' && s !== 'otherOs' && s !== 'manual' && s !== 'confirm' && s !== 'unavailable'
    })
    if (pending) void checkAll(true)
  })

  const busy = computed(() => checking.value.size > 0)
  return { results, checking, busy, checkAll, confirmAndCheck, os }
}

/** Nei test end-to-end i risultati dei comandi si possono simulare (window.__pgmChecks). */
function hasFakeChecks() {
  return typeof window !== 'undefined' && !!(window as unknown as { __pgmChecks?: unknown }).__pgmChecks
}
