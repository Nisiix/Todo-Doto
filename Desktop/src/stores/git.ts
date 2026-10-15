import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getFs } from '@/services/fs'
import { resolveStack, varsFor } from '@/services/scaffold'
import { useWorkspaceStore } from './workspace'
import type { Project } from '@/types'

/** Tra una lettura dei commit e la successiva dello stesso progetto (salvo richiesta esplicita). */
const MIN_INTERVAL_MS = 20_000

/**
 * Commit git → task. Per ogni progetto si guarda se la cartella del progetto
 * contiene `.git` (solo allora l'app mostra codice e suggerimento); se sì, e se
 * la chiusura dai commit è attiva, all'apertura del progetto e al ritorno sulla
 * finestra si leggono i commit (in sola lettura) e si completano i task citati
 * con "chiude TODO-n".
 */
export const useGitStore = defineStore('git', () => {
  const ws = useWorkspaceStore()
  /** progetto → la sua cartella contiene un repository git */
  const hasGit = ref<Record<string, boolean>>({})
  const lastScan = new Map<string, number>()
  const busy = new Set<string>()

  const repoOf = (p: Project) => resolveStack(p.stack, varsFor(p.name)).sourcePath.trim()

  async function detect(p: Project): Promise<boolean> {
    const repo = repoOf(p)
    let found = false
    if (repo) {
      try {
        const fs = await getFs()
        found = await fs.exists(await fs.join(repo, '.git'))
      } catch {
        found = false // cartella non raggiungibile: come se non ci fosse
      }
    }
    if (hasGit.value[p.id] !== found) hasGit.value = { ...hasGit.value, [p.id]: found }
    return found
  }

  /** Legge i commit e chiude i task citati. Silenziosa se qualcosa non va (cartella non raggiungibile, git assente…). */
  async function scan(p: Project, force = false) {
    if (busy.has(p.id) || p.trashedAt) return
    if (!force && Date.now() - (lastScan.get(p.id) ?? 0) < MIN_INTERVAL_MS) return
    busy.add(p.id)
    lastScan.set(p.id, Date.now())
    try {
      if (!(await detect(p)) || !p.git.autoClose) return
      const commits = await (await getFs()).gitLog(repoOf(p), 300)
      await ws.applyGitCommits(p.id, commits)
    } catch {
      /* repository non leggibile: si riproverà al prossimo giro */
    } finally {
      busy.delete(p.id)
    }
  }

  function reset() {
    hasGit.value = {}
    lastScan.clear()
  }

  return { hasGit, detect, scan, reset }
})
