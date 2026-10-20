import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useSessionStore } from './session'
import { getFs } from '@/services/fs'
import { samePath } from '@/services/projectScan'
import { vpnConnect, vpnList, VPN_NEEDS_CREDENTIALS, type VpnInfo } from '@/services/office'

/** Tra due tentativi automatici di collegamento almeno questo tempo. */
const RETRY_MS = 2 * 60_000

/**
 * VPN dell'ufficio (per PC e per workspace): si usa una connessione VPN già
 * configurata in Windows. Collegata a mano dalle impostazioni o, se scelto,
 * da sola quando la cartella condivisa non risponde (all'apertura o mentre si
 * lavora). Le credenziali restano a Windows.
 */
export const useVpnStore = defineStore('vpn', () => {
  const session = useSessionStore()
  const list = ref<VpnInfo[]>([])
  const supported = ref<boolean | null>(null)
  const connecting = ref(false)
  /** Esito dell'ultimo collegamento (testo per l'utente; vuoto se riuscito). */
  const lastError = ref('')
  const lastTry = new Map<string, number>()

  async function refresh() {
    try {
      list.value = await vpnList()
      supported.value = true
    } catch {
      list.value = []
      supported.value = false
    }
    return list.value
  }

  const prefFor = (workspaceId: string | null | undefined) => (workspaceId ? (session.config.vpn[workspaceId] ?? null) : null)

  async function setPref(workspaceId: string, name: string, auto: boolean) {
    const next = { ...session.config.vpn }
    if (name) next[workspaceId] = { name, auto }
    else delete next[workspaceId]
    session.config.vpn = next
    await session.saveConfig()
  }

  /**
   * Collega la VPN. `needsCredentials`: Windows chiede utente e password
   * (si apre il pannello VPN di Windows, dove l'utente si collega).
   */
  async function connect(name: string): Promise<{ ok: boolean; needsCredentials?: boolean; message?: string }> {
    if (!name || connecting.value) return { ok: false }
    connecting.value = true
    lastTry.set(name, Date.now())
    try {
      const r = await vpnConnect(name)
      lastError.value = r.ok ? '' : r.message
      if (!r.ok && r.code !== null && VPN_NEEDS_CREDENTIALS.has(r.code)) return { ok: false, needsCredentials: true, message: r.message }
      return { ok: r.ok, message: r.message }
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      return { ok: false, message: lastError.value }
    } finally {
      connecting.value = false
      void refresh()
    }
  }

  const openWindowsVpn = async () => (await getFs()).openExternal('ms-settings:network-vpn', 'link')

  /** Tentativo automatico (se scelto per quel workspace e non troppo ravvicinato). */
  async function autoConnect(workspaceId: string | null | undefined): Promise<boolean> {
    const pref = prefFor(workspaceId)
    if (!pref?.auto || !pref.name) return false
    if (Date.now() - (lastTry.get(pref.name) ?? 0) < RETRY_MS) return false
    const r = await connect(pref.name)
    return r.ok
  }

  /** All'apertura di un percorso che non risponde: la VPN del workspace che c'era a quel percorso. */
  async function autoConnectForPath(path: string): Promise<boolean> {
    const recent = session.config.recent.find((r) => samePath(r.path, path))
    return autoConnect(recent?.id)
  }

  return { list, supported, connecting, lastError, refresh, prefFor, setPref, connect, openWindowsVpn, autoConnect, autoConnectForPath }
})
