import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getFs } from '@/services/fs'
import { commitCandidates, matchCommits, type CommitSuggestion } from '@/services/aiAssist'
import type { GitCommit } from '@/services/gitLink'
import { useAiStore, withAi } from './ai'
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
      await suggestFromCommits(p.id, commits)
    } catch {
      /* repository non leggibile: si riproverà al prossimo giro */
    } finally {
      busy.delete(p.id)
    }
  }

  // --- commit senza "chiude TODO-n": suggerimenti dell'IA locale (da confermare) ------
  //
  // Per i commit recenti che non citano un task, l'IA locale (se attiva su questo
  // PC) propone quale task potrebbero aver completato. Ogni commit si esamina una
  // volta; i suggerimenti restano su questo PC finché l'utente non li conferma o
  // li ignora. La regola "chiude TODO-n" non cambia.
  const ai = useAiStore()
  const suggestions = ref<Record<string, CommitSuggestion[]>>({})
  const commitsByHash = new Map<string, GitCommit>()
  const key = (kind: string, projectId: string) => `pgm:git-ai-${kind}:${ws.meta?.id ?? ''}:${projectId}`
  const readList = <T,>(k: string): T[] => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '[]') as T[]
    } catch {
      return []
    }
  }
  const writeList = (k: string, v: unknown[]) => {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* spazio esaurito: si riproverà */
    }
  }
  const suggestionsOf = (projectId: string) => suggestions.value[projectId] ?? readList<CommitSuggestion>(key('sugg', projectId))
  function setSuggestions(projectId: string, list: CommitSuggestion[]) {
    suggestions.value = { ...suggestions.value, [projectId]: list }
    writeList(key('sugg', projectId), list)
  }

  async function suggestFromCommits(projectId: string, commits: GitCommit[]) {
    for (const c of commits) commitsByHash.set(c.hash, c)
    if (!ai.config.enabled) return
    const seen = new Set(readList<string>(key('seen', projectId)))
    const candidates = commitCandidates(commits, seen)
    if (!candidates.length) return
    const project = ws.projects[projectId]
    if (!project) return
    const found = await withAi((cfg) => matchCommits(cfg, candidates, project.items))
    if (found === null) return // IA non disponibile: si riproverà
    writeList(key('seen', projectId), [...seen, ...candidates.map((c) => c.hash)].slice(-500))
    const current = suggestionsOf(projectId)
    const fresh = found.filter((f) => !current.some((c) => c.hash === f.hash || c.itemId === f.itemId))
    if (fresh.length) setSuggestions(projectId, [...current, ...fresh])
  }

  /** Suggerimenti ancora validi (il task è ancora da fare). */
  function pending(p: Project): CommitSuggestion[] {
    const list = suggestionsOf(p.id)
    return list.filter((s) => p.items.some((i) => i.id === s.itemId && i.bucket === 'todo'))
  }

  async function acceptSuggestion(projectId: string, s: CommitSuggestion) {
    const commit = commitsByHash.get(s.hash) ?? { hash: s.hash, author: s.author, date: s.date, message: s.subject }
    await ws.closeItemByCommit(projectId, s.itemId, commit)
    dismissSuggestion(projectId, s)
  }
  function dismissSuggestion(projectId: string, s: CommitSuggestion) {
    setSuggestions(projectId, suggestionsOf(projectId).filter((x) => x.hash !== s.hash))
  }

  function reset() {
    hasGit.value = {}
    lastScan.clear()
    suggestions.value = {}
  }

  return { hasGit, detect, scan, reset, suggestions, pending, acceptSuggestion, dismissSuggestion }
})
