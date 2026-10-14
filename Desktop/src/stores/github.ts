import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getHttp } from '@/services/http'
import { getFs } from '@/services/fs'
import { loadGitHubAuth, saveGitHubAuth, type GitHubAuthFile } from '@/services/config'
import { GitHubClient, type GitHubRepo } from '@/services/github'
import { stackFromSource } from '@/services/projectScan'
import { useSessionStore } from './session'
import { useWorkspaceStore } from './workspace'
import { useUiStore } from './ui'
import type { Project } from '@/types'
import { defineMessages, plural } from '@/i18n'

const M = defineMessages({
  it: {
    connected: (login: string) => `GitHub collegato come ${login}`,
    synced: (n: number) => `${n} ${plural(n, 'progetto sincronizzato', 'progetti sincronizzati')} da GitHub`,
    imported: (n: number) => `${n} ${plural(n, 'progetto creato o collegato', 'progetti creati o collegati')} da GitHub`,
    syncFailed: (name: string, err: string) => `Sincronizzazione di «${name}» non riuscita: ${err}`,
  },
  en: {
    connected: (login: string) => `GitHub connected as ${login}`,
    synced: (n: number) => `${n} ${plural(n, 'project', 'projects')} synced from GitHub`,
    imported: (n: number) => `${n} ${plural(n, 'project', 'projects')} created or linked from GitHub`,
    syncFailed: (name: string, err: string) => `Syncing “${name}” failed: ${err}`,
  },
})

/** Dopo quanto tempo un progetto collegato viene risincronizzato in automatico. */
const AUTO_SYNC_MS = 60 * 60 * 1000

/**
 * Collegamento a GitHub (per macchina: il token è dell'utente) e
 * sincronizzazione dei progetti del workspace collegati a un repository:
 * lo Stack si ricava dai file del repository e si unisce a quello esistente.
 */
export const useGitHubStore = defineStore('github', () => {
  const session = useSessionStore()
  const ws = useWorkspaceStore()
  const ui = useUiStore()

  const auth = ref<GitHubAuthFile | null>(null)
  const loaded = ref(false)
  const repos = ref<GitHubRepo[]>([])
  const loadingRepos = ref(false)
  const busy = ref('') // testo dell'operazione in corso
  const error = ref('')

  const connected = computed(() => !!auth.value?.token)
  const account = computed(() => (auth.value ? { login: auth.value.login, name: auth.value.name } : null))
  const autoSync = computed(() => auth.value?.autoSync ?? true)
  let clientCache: { token: string; client: Promise<GitHubClient> } | null = null
  function client(): Promise<GitHubClient> {
    const token = auth.value?.token ?? ''
    if (!clientCache || clientCache.token !== token) clientCache = { token, client: getHttp().then((f) => new GitHubClient(f, token)) }
    return clientCache.client
  }

  const linkedProjects = computed(() => ws.visibleProjects.filter((p) => p.github))
  const projectForRepo = (r: Pick<GitHubRepo, 'owner' | 'name'>) =>
    ws.visibleProjects.find((p) => p.github?.owner.toLowerCase() === r.owner.toLowerCase() && p.github.repo.toLowerCase() === r.name.toLowerCase()) ?? null

  async function init() {
    if (loaded.value) return
    auth.value = await loadGitHubAuth(session.localSecret)
    loaded.value = true
  }

  async function connect(token: string) {
    error.value = ''
    const t = token.trim()
    const user = await new GitHubClient(await getHttp(), t).user()
    auth.value = { token: t, login: user.login, name: user.name, autoSync: auth.value?.autoSync ?? true }
    await saveGitHubAuth(auth.value, session.localSecret)
    ui.toast(M.connected(user.login), 'success')
  }

  async function disconnect() {
    auth.value = null
    repos.value = []
    await saveGitHubAuth(null, session.localSecret)
  }

  async function setAutoSync(on: boolean) {
    if (!auth.value) return
    auth.value = { ...auth.value, autoSync: on }
    await saveGitHubAuth(auth.value, session.localSecret)
  }

  async function loadRepos() {
    if (!connected.value) return
    loadingRepos.value = true
    error.value = ''
    try {
      repos.value = await (await client()).repos()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loadingRepos.value = false
    }
  }

  /** Stack di un repository: file della radice, README, linguaggi di GitHub; il primo passo è il clone. */
  async function detect(owner: string, repo: string, sourcePath: string) {
    const c = await client()
    const [info, languages] = await Promise.all([c.repo(owner, repo), c.languages(owner, repo).catch(() => [])])
    const detected = await stackFromSource(c.source(owner, repo), { repoUrl: info.htmlUrl, languages, sourcePath, clone: true })
    return { description: detected.description || info.description, stack: detected.stack }
  }

  /** Cartella proposta per il progetto: <cartella dei progetti del workspace>/<nome del repository>. */
  async function proposedPath(repo: string) {
    const root = ws.projectsRoot
    return root ? (await getFs()).join(root, repo) : ''
  }

  async function syncProject(p: Project) {
    if (!p.github) return false
    const detected = await detect(p.github.owner, p.github.repo, p.stack.sourcePath || (await proposedPath(p.github.repo)))
    return !!(await ws.applyRepoStack(p.id, p.github, detected))
  }

  /** Sincronizza i progetti collegati (tutti, o solo quelli non sincronizzati da più di un'ora). */
  async function syncAll(opts: { onlyStale?: boolean; silent?: boolean } = {}) {
    if (!connected.value || !ws.isAdmin) return 0
    const now = Date.now()
    const list = linkedProjects.value.filter((p) => !opts.onlyStale || !p.github!.syncedAt || now - Date.parse(p.github!.syncedAt) > AUTO_SYNC_MS)
    let n = 0
    for (const [i, p] of list.entries()) {
      busy.value = `${i + 1}/${list.length} · ${p.name}`
      try {
        if (await syncProject(p)) n++
      } catch (e) {
        if (!opts.silent) ui.toast(M.syncFailed(p.name, e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
      }
    }
    busy.value = ''
    if (n && (!opts.silent || n > 0)) ui.toast(M.synced(n), 'success', undefined, 3000)
    return n
  }

  /** All'apertura del workspace: risincronizza in automatico i progetti collegati (se attivo). */
  async function autoSyncOnOpen() {
    await init()
    if (autoSync.value && connected.value && ws.isAdmin && linkedProjects.value.length) await syncAll({ onlyStale: true, silent: true })
  }

  /**
   * Crea un progetto per ogni repository scelto (nome = nome del repository) e
   * lo collega; se esiste già un progetto con lo stesso nome non collegato,
   * collega quello. I repository già collegati vengono solo risincronizzati.
   */
  async function importRepos(list: GitHubRepo[], onProgress?: (done: number, total: number) => void) {
    let n = 0
    for (const [i, r] of list.entries()) {
      try {
        let p = projectForRepo(r) ?? ws.visibleProjects.find((x) => !x.github && x.name.toLowerCase() === r.name.toLowerCase()) ?? null
        if (!p) p = (await ws.createProject({ name: r.name, description: r.description, folderId: null, members: [] })) ?? null
        if (p) {
          const detected = await detect(r.owner, r.name, p.stack.sourcePath || (await proposedPath(r.name)))
          if (await ws.applyRepoStack(p.id, { owner: r.owner, repo: r.name }, detected)) n++
        }
      } catch (e) {
        ui.toast(M.syncFailed(r.name, e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
      }
      onProgress?.(i + 1, list.length)
    }
    if (n) ui.toast(M.imported(n), 'success', undefined, 4000)
    return n
  }

  /** Collega un progetto al repository indicato nel suo Stack (URL github.com) e lo sincronizza. */
  async function linkProject(p: Project, owner: string, repo: string) {
    const detected = await detect(owner, repo, p.stack.sourcePath || (await proposedPath(repo)))
    return ws.applyRepoStack(p.id, { owner, repo }, detected)
  }

  return {
    auth,
    loaded,
    repos,
    loadingRepos,
    busy,
    error,
    connected,
    account,
    autoSync,
    linkedProjects,
    projectForRepo,
    init,
    connect,
    disconnect,
    setAutoSync,
    loadRepos,
    syncProject,
    syncAll,
    autoSyncOnOpen,
    importRepos,
    linkProject,
  }
})
