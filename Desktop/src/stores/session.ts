import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getFs } from '@/services/fs'
import { loadConfig, saveConfig } from '@/services/config'
import type { Identity, LocalConfig, RecentWorkspace } from '@/types'

/** Identità locale (SO) e configurazione per macchina. */
export const useSessionStore = defineStore('session', () => {
  const identity = ref<Identity>({ username: '', hostname: '' })
  const config = ref<LocalConfig>({ theme: 'system', recent: [], reopenLast: true, favorites: {}, mutedNotifications: [] })
  const ready = ref(false)

  /** Chiave con cui si cifrano le password memorizzate in locale. */
  const localSecret = computed(() => `${identity.value.username}@${identity.value.hostname}`)

  async function init() {
    if (ready.value) return
    const fs = await getFs()
    identity.value = await fs.identity()
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

  return { identity, config, ready, localSecret, init, touchRecent, removeRecent, forgetWorkspace, favoritesOf, toggleFavorite }
})
