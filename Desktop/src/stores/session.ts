import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getFs } from '@/services/fs'
import { loadConfig, saveConfig } from '@/services/config'
import { domainIdentity } from '@/services/office'
import { DEFAULT_AI_CONFIG, type Identity, type LocalConfig, type RecentWorkspace } from '@/types'

/** Identità locale (SO) e configurazione per macchina. */
export const useSessionStore = defineStore('session', () => {
  const identity = ref<Identity>({ username: '', hostname: '' })
  const config = ref<LocalConfig>({ theme: 'system', recent: [], reopenLast: true, offlineCopy: true, vpn: {}, favorites: {}, mutedNotifications: [], ai: { ...DEFAULT_AI_CONFIG }, snoozed: {} })
  const ready = ref(false)

  /** Chiave con cui si cifrano le password memorizzate in locale. */
  const localSecret = computed(() => `${identity.value.username}@${identity.value.hostname}`)

  async function init() {
    if (ready.value) return
    const fs = await getFs()
    identity.value = await fs.identity()
    // Account di dominio (PC in Active Directory o Entra ID): per l'accesso aziendale, se il workspace lo usa
    try {
      const d = await domainIdentity()
      if (d.sid && d.domain) identity.value = { ...identity.value, domain: d.domain, sid: d.sid, groups: d.groups }
    } catch {
      /* account locale o sistema senza dominio */
    }
    config.value = await loadConfig()
    ready.value = true
  }

  async function touchRecent(entry: Omit<RecentWorkspace, 'lastOpened' | 'projectsPath'> & { projectsPath?: string }) {
    const rest = config.value.recent.filter((r) => r.path !== entry.path)
    config.value.recent = [{ ...entry, projectsPath: entry.projectsPath ?? '', lastOpened: new Date().toISOString() }, ...rest].slice(0, 12)
    await saveConfig(config.value)
  }

  async function removeRecent(path: string) {
    config.value.recent = config.value.recent.filter((r) => r.path !== path)
    await saveConfig(config.value)
  }

  /** Dimentica tutto ciò che questo PC ricorda di un workspace (recenti, preferiti). */
  async function forgetWorkspace(workspaceId: string, path: string) {
    config.value.recent = config.value.recent.filter((r) => r.path !== path && r.id !== workspaceId)
    delete config.value.favorites[workspaceId]
    await saveConfig(config.value)
  }

  // --- preferiti (per macchina, per workspace) ---------------------------------
  const favoritesOf = (workspaceId: string) => config.value.favorites[workspaceId] ?? []

  async function toggleFavorite(workspaceId: string, projectId: string) {
    const cur = favoritesOf(workspaceId)
    config.value.favorites[workspaceId] = cur.includes(projectId) ? cur.filter((id) => id !== projectId) : [...cur, projectId]
    await saveConfig(config.value)
  }

  /** Salva la configurazione di questo PC (dopo averla cambiata). */
  /** Rinvii della vista «Oggi» del workspace: id del task → giorno in cui ricompare. */
  const snoozedOf = (workspaceId: string) => config.value.snoozed[workspaceId] ?? {}

  /** Rinvia un task fino al giorno indicato (null = lo riprende subito); i rinvii scaduti si tolgono. */
  async function snooze(workspaceId: string, itemId: string, until: string | null, today: string) {
    const cur = Object.fromEntries(Object.entries(snoozedOf(workspaceId)).filter(([, d]) => d > today))
    if (until && until > today) cur[itemId] = until
    else delete cur[itemId]
    config.value.snoozed = { ...config.value.snoozed, [workspaceId]: cur }
    await saveConfig(config.value)
  }

  const persist = () => saveConfig(config.value)

  return { identity, config, ready, localSecret, init, saveConfig: persist, touchRecent, removeRecent, forgetWorkspace, favoritesOf, toggleFavorite, snoozedOf, snooze }
})
