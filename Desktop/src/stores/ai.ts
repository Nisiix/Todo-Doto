import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { saveConfig } from '@/services/config'
import { AiError, probe, pullModel, type ProbeResult, type PullProgress } from '@/services/localAi'
import { DEFAULT_AI_CONFIG, type AiConfig } from '@/types'
import { useSessionStore } from './session'
import { useUiStore } from './ui'
import { defineMessages } from '@/i18n'

const M = defineMessages({
  it: { found: (m: string) => `IA locale attivata: ${m} è già installato su questo PC. Puoi cambiarla nelle Impostazioni › IA locale.` },
  en: { found: (m: string) => `Local AI turned on: ${m} is already installed on this PC. You can change it in Settings › Local AI.` },
})

export type AiStatus = 'off' | 'unknown' | 'checking' | 'ready' | 'offline' | 'no-model'

/**
 * IA locale su questo PC: configurazione (per macchina), stato del motore,
 * scaricamento dei modelli. Le funzioni che la usano chiedono `ensureReady()`:
 * se il motore non c'è o è spento, lavorano come sempre senza IA.
 */
export const useAiStore = defineStore('ai', () => {
  const session = useSessionStore()
  const ui = useUiStore()

  const config = computed<AiConfig>(() => ({ ...DEFAULT_AI_CONFIG, ...session.config.ai }))
  const status = ref<AiStatus>('unknown')
  const lastProbe = ref<ProbeResult | null>(null)
  let checkedAt = 0

  /** IA attiva e pronta: le funzioni assistite sono disponibili. */
  const active = computed(() => config.value.enabled && status.value === 'ready')
  /** Banner "Attiva l'IA locale": finché non è attiva e l'utente non l'ha chiuso su questo PC. */
  const showBanner = computed(() => session.ready && !config.value.enabled && !config.value.bannerDismissed)

  async function save(patch: Partial<AiConfig>) {
    const before = config.value
    session.config.ai = { ...before, ...patch }
    await saveConfig(session.config)
    const engineChanged = (['enabled', 'provider', 'baseUrl', 'model', 'embedModel'] as const).some((k) => k in patch && patch[k] !== before[k])
    if (engineChanged) {
      status.value = session.config.ai.enabled ? 'unknown' : 'off'
      checkedAt = 0
    }
  }

  /** Interroga il motore (senza scaricare nulla) e aggiorna lo stato. */
  async function check(cfg: AiConfig = config.value): Promise<ProbeResult> {
    status.value = 'checking'
    const r = await probe(cfg)
    lastProbe.value = r
    checkedAt = Date.now()
    status.value = !cfg.enabled ? 'off' : !r.ok ? 'offline' : r.hasModel ? 'ready' : 'no-model'
    return r
  }

  /**
   * L'IA si può usare adesso? Si ricontrolla al massimo ogni 30 secondi se era
   * pronta, subito se non lo era (es. Ollama avviato nel frattempo).
   */
  async function ensureReady(): Promise<boolean> {
    if (!config.value.enabled) return false
    if (status.value === 'ready' && Date.now() - checkedAt < 30_000) return true
    if (status.value === 'checking') return false
    await check()
    return status.value === 'ready'
  }

  /** Dopo un errore della richiesta: al prossimo uso si ricontrolla. */
  function markStale() {
    checkedAt = 0
    if (status.value === 'ready') status.value = 'unknown'
  }

  /**
   * Al primo avvio (una volta sola): se su questo PC c'è già un motore con il
   * modello consigliato (es. installato con l'opzione dell'installer) l'IA si
   * attiva da sola, con un avviso. Poi decide solo l'utente.
   */
  async function start() {
    const cfg = config.value
    if (cfg.enabled) {
      void check()
      return
    }
    status.value = 'off'
    if (cfg.autoDetectDone) return
    const r = await probe({ ...cfg, enabled: true }, 2_500)
    await save({ autoDetectDone: true })
    if (r.ok && r.hasModel) {
      await save({ enabled: true })
      await check()
      ui.toast(M.found(cfg.model), 'success', undefined, 8000)
    }
  }

  async function dismissBanner() {
    await save({ bannerDismissed: true })
  }

  // --- scaricamento dei modelli (Ollama) ---------------------------------------
  const pulling = ref<{ model: string; progress: PullProgress } | null>(null)
  let pullCtl: AbortController | null = null

  /** Scarica i modelli indicati uno dopo l'altro; "cancelled" se interrotto. */
  async function pull(models: string[], cfg: AiConfig = config.value) {
    if (pulling.value) return
    pullCtl = new AbortController()
    try {
      for (const model of models) {
        pulling.value = { model, progress: { status: '', completed: 0, total: 0 } }
        await pullModel(cfg, model, (p) => pulling.value && (pulling.value = { model, progress: p }), pullCtl.signal)
      }
    } finally {
      pulling.value = null
      pullCtl = null
      checkedAt = 0
    }
  }
  function cancelPull() {
    pullCtl?.abort()
  }

  return { config, status, lastProbe, active, showBanner, save, check, ensureReady, markStale, start, dismissBanner, pulling, pull, cancelPull }
})

/** Esegue `fn` con l'IA se è pronta; altrimenti (o se fallisce) restituisce null senza disturbare. */
export async function withAi<T>(fn: (cfg: AiConfig) => Promise<T>): Promise<T | null> {
  const ai = useAiStore()
  if (!(await ai.ensureReady())) return null
  try {
    return await fn(ai.config)
  } catch (e) {
    if (e instanceof AiError && (e.code === 'unreachable' || e.code === 'no-model' || e.code === 'timeout')) ai.markStale()
    console.warn('[ia locale]', e)
    return null
  }
}
