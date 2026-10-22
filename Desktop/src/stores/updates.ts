import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useSessionStore } from './session'
import { getHttp } from '@/services/http'
import { APP_VERSION, LATEST_RELEASE_API } from '@/services/branding'
import { isCheckDue, isNewer, parseRelease, type ReleaseInfo } from '@/services/feedback'

export type CheckResult = 'new' | 'current' | 'error'

/**
 * Avviso di nuova versione: una richiesta al giorno all'ultima Release su
 * GitHub (solo lettura, senza dati dell'utente), disattivabile in Impostazioni.
 * L'aggiornamento resta manuale: l'avviso porta alla pagina di download.
 */
export const useUpdatesStore = defineStore('updates', () => {
  const session = useSessionStore()
  const prefs = computed(() => session.config.updates)
  const checking = ref(false)
  /** Esito dell'ultimo controllo fatto in questa sessione. */
  const lastResult = ref<CheckResult | null>(null)

  /** Versione più recente di questa, se c'è (anche dall'ultimo controllo salvato). */
  const available = computed<ReleaseInfo | null>(() => {
    const l = prefs.value.latest
    return l && isNewer(l.version, APP_VERSION) ? l : null
  })
  /** Banner: c'è una versione nuova e non è stata messa da parte con «Più tardi». */
  const showBanner = computed(() => !!available.value && prefs.value.skipped !== available.value.version)

  async function save(patch: Partial<typeof session.config.updates>) {
    session.config.updates = { ...session.config.updates, ...patch }
    await session.saveConfig()
  }

  async function check(): Promise<CheckResult> {
    if (checking.value) return lastResult.value ?? 'error'
    checking.value = true
    try {
      const fetch = await getHttp()
      const r = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      // Nessuna Release pubblicata: niente da proporre
      const latest = r.status === 404 ? null : r.ok ? parseRelease(await r.json()) : undefined
      if (latest === undefined) throw new Error(`HTTP ${r.status}`)
      await save({ lastCheck: new Date().toISOString(), latest })
      lastResult.value = latest && isNewer(latest.version, APP_VERSION) ? 'new' : 'current'
    } catch {
      lastResult.value = 'error'
    } finally {
      checking.value = false
    }
    return lastResult.value
  }

  /** All'avvio: se attivo e se l'ultimo controllo ha più di un giorno. */
  async function autoCheck() {
    if (!prefs.value.check || !isCheckDue(prefs.value.lastCheck)) return
    await check()
  }

  const skip = () => (available.value ? save({ skipped: available.value.version }) : Promise.resolve())
  const setEnabled = (on: boolean) => save({ check: on })

  return { prefs, checking, lastResult, available, showBanner, check, autoCheck, skip, setEnabled }
})
