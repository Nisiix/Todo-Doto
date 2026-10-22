/**
 * Condivisione con gli altri membri: possibile solo con la cartella Dati su
 * un'unità di rete (i dati dell'app li devono raggiungere tutti). La cartella
 * dei progetti e quelle dei singoli progetti possono stare anche in locale:
 * si presume che ogni PC usi lo stesso percorso (es. D:\Sviluppo su tutti).
 * Un workspace si condivide se la cartella Dati è in rete e c'è la cartella
 * dei progetti; un progetto (visibilità e utenti che lo vedono) se la cartella
 * Dati è in rete e il progetto ha una cartella. Con la cartella Dati su un
 * disco di questo PC gli altri non la raggiungerebbero: lo si dice all'utente
 * invece di lasciargli scegliere a chi mostrarlo.
 *
 * Al contrario un workspace «Solo su questo PC» deve avere entrambe le
 * cartelle in locale (vedi `checkLocalOnly`).
 *
 * In rete: \\server\condivisione e le lettere di unità collegate a una
 * condivisione (es. Z:), riconosciute dal backend. Nell'anteprima nel browser
 * e nei test le unità di rete si simulano con `window.__pgmNetworkDrives`
 * (prefissi, es. ['/rete', 'Z:']).
 */
import { reactive } from 'vue'
import { defineMessages } from '@/i18n'
import type { Project } from '@/types'
import { isTauri } from './fs'

const m = defineMessages({
  it: {
    data: (p: string) => `la cartella Dati (${p})`,
    projects: (p: string) => `la cartella dei progetti (${p})`,
    project: (p: string) => `la cartella del progetto (${p})`,
    noProjectFolder: 'il progetto non ha una cartella',
    noProjectsFolder: 'manca la cartella dei progetti',
    noDataFolder: 'manca la cartella Dati',
    and: ' e ',
    isLocal: (what: string, n: number) => `${what} ${n === 1 ? 'è' : 'sono'} in locale, su questo PC`,
    isRemote: (what: string, n: number) => `${what} ${n === 1 ? 'è' : 'sono'} su un’unità di rete`,
    workspace: (why: string) =>
      `Non è possibile condividere il workspace: ${why}. Per condividerlo con i colleghi scegli la cartella Dati su un’unità di rete o su un server (es. \\\\server\\Todo Doto o Z:\\Todo Doto). La cartella dei progetti può stare anche in locale, purché su ogni PC abbia lo stesso percorso.`,
    projectBlocked: (why: string) => `Non è possibile condividere questo progetto con gli altri membri: ${why}. Per condividerlo, la cartella Dati deve essere su un’unità di rete o su un server.`,
    localOnly: (why: string) => `Un workspace «Solo su questo PC» deve avere la cartella Dati e la cartella dei progetti su questo PC: ${why}. Scegli cartelle in locale oppure condividi il workspace in rete.`,
  },
  en: {
    data: (p: string) => `the data folder (${p})`,
    projects: (p: string) => `the projects folder (${p})`,
    project: (p: string) => `the project folder (${p})`,
    noProjectFolder: 'the project has no folder',
    noProjectsFolder: 'the projects folder is missing',
    noDataFolder: 'the data folder is missing',
    and: ' and ',
    isLocal: (what: string, n: number) => `${what} ${n === 1 ? 'is' : 'are'} local, on this PC`,
    isRemote: (what: string, n: number) => `${what} ${n === 1 ? 'is' : 'are'} on a network drive`,
    workspace: (why: string) =>
      `The workspace cannot be shared: ${why}. To share it with colleagues, choose the data folder on a network drive or a server (e.g. \\\\server\\Todo Doto or Z:\\Todo Doto). The projects folder can also be local, as long as it has the same path on every PC.`,
    projectBlocked: (why: string) => `This project cannot be shared with the other members: ${why}. To share it, the data folder must be on a network drive or a server.`,
    localOnly: (why: string) => `An “Only on this PC” workspace must keep the data folder and the projects folder on this PC: ${why}. Choose local folders or share the workspace on the network.`,
  },
})

const fakeDrives = (): string[] | undefined => (typeof window !== 'undefined' ? (window as unknown as { __pgmNetworkDrives?: string[] }).__pgmNetworkDrives : undefined)
const slash = (p: string) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** \\server\condivisione (non i percorsi locali estesi \\?\C:\…). */
export const isUncPath = (path: string) => {
  const p = path.trim()
  if (/^\\\\[?.]\\/.test(p)) return /^\\\\[?.]\\UNC\\/i.test(p)
  return /^(?:\\\\|\/\/)[^\\/]/.test(p)
}

/** La cartella è su un'unità di rete? */
export async function isRemotePath(path: string): Promise<boolean> {
  const p = path.trim()
  if (!p) return false
  if (isUncPath(p)) return true
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<boolean>('path_is_remote', { path: p }).catch(() => false)
  }
  const n = slash(p)
  return (fakeDrives() ?? []).some((d) => {
    const x = slash(d)
    return !!x && (n === x || n.startsWith(x.endsWith(':') ? x : `${x}/`))
  })
}

/** Esiti già noti, per l'interfaccia (reattivi): undefined mentre si controlla. */
const known = reactive(new Map<string, boolean>())
const asking = new Set<string>()
export function remoteState(path: string): boolean | undefined {
  const k = path.trim()
  if (!k) return false
  if (known.has(k)) return known.get(k)
  if (!asking.has(k)) {
    asking.add(k)
    void isRemotePath(k)
      .then((v) => known.set(k, v))
      .finally(() => asking.delete(k))
  }
  return undefined
}

export type SharePart = 'data' | 'projects' | 'project'
export interface ShareCheck {
  /** La cartella Dati è in rete e le altre cartelle ci sono. */
  ok: boolean
  /** Qualche cartella è ancora da controllare. */
  pending: boolean
  /** Le cartelle che impediscono la condivisione: la cartella Dati in locale, o una cartella mancante. */
  local: { part: SharePart; path: string }[]
}

/** Solo la cartella Dati deve essere in rete; le cartelle dei progetti basta che ci siano. */
const mustBeRemote = (part: SharePart) => part === 'data'

const evaluate = (parts: { part: SharePart; path: string }[], remote: (p: string) => boolean | undefined): ShareCheck => {
  const states = parts.map((x) => ({ ...x, remote: !x.path.trim() ? false : mustBeRemote(x.part) ? remote(x.path) : true }))
  const local = states.filter((x) => x.remote === false).map(({ part, path }) => ({ part, path: path.trim() }))
  const pending = states.some((x) => x.remote === undefined)
  return { ok: !local.length && !pending, pending: pending && !local.length, local }
}

/** Esito per l'interfaccia (reattivo, usa i controlli già fatti). */
export const shareState = (parts: { part: SharePart; path: string }[]): ShareCheck => evaluate(parts, remoteState)

/** Esito aggiornato adesso (per il salvataggio). */
export async function checkShare(parts: { part: SharePart; path: string }[]): Promise<ShareCheck> {
  const results = new Map<string, boolean>()
  for (const x of parts) if (x.path.trim() && mustBeRemote(x.part)) results.set(x.path.trim(), await isRemotePath(x.path))
  for (const [k, v] of results) known.set(k, v)
  return evaluate(parts, (p) => results.get(p.trim()) ?? false)
}

/** Workspace «Solo su questo PC»: le cartelle che invece sono su un'unità di rete (vuoto se va bene). */
export async function checkLocalOnly(parts: { part: SharePart; path: string }[]): Promise<{ part: SharePart; path: string }[]> {
  const remote: { part: SharePart; path: string }[] = []
  for (const x of parts) {
    const p = x.path.trim()
    if (!p) continue
    const r = await isRemotePath(p)
    known.set(p, r)
    if (r) remote.push({ part: x.part, path: p })
  }
  return remote
}

/** Cartella del progetto condivisa nel workspace: quella del progetto, altrimenti <cartella dei progetti>\<nome>. */
export function projectFolderOf(p: Pick<Project, 'name' | 'stack'>, projectsRoot: string): string {
  const own = p.stack.sourcePath.trim()
  if (own || !projectsRoot.trim()) return own
  const root = projectsRoot.trim().replace(/[\\/]+$/, '')
  return `${root}${root.includes('\\') ? '\\' : '/'}${p.name.trim()}`
}

export const workspaceParts = (dataPath: string, projectsPath: string) => [
  { part: 'data' as const, path: dataPath },
  { part: 'projects' as const, path: projectsPath },
]
export const projectParts = (dataPath: string, projectFolder: string) => [
  { part: 'data' as const, path: dataPath },
  { part: 'project' as const, path: projectFolder },
]

function why(local: ShareCheck['local']): string {
  const named = local.filter((x) => x.path)
  const parts = named.length ? [m.isLocal(named.map((x) => m[x.part](x.path)).join(m.and), named.length)] : []
  const missing = { data: m.noDataFolder, projects: m.noProjectsFolder, project: m.noProjectFolder }
  for (const x of local) if (!x.path) parts.push(missing[x.part])
  return parts.join(m.and)
}

/** Perché il workspace non si può condividere ('' se si può). */
export const workspaceShareText = (c: ShareCheck) => (c.local.length ? m.workspace(why(c.local)) : '')
/** Perché il progetto non si può condividere ('' se si può). */
export const projectShareText = (c: ShareCheck) => (c.local.length ? m.projectBlocked(why(c.local)) : '')
/** Perché un workspace «Solo su questo PC» non va bene con queste cartelle ('' se va bene). */
export const workspaceLocalOnlyText = (remote: { part: SharePart; path: string }[]) =>
  remote.length ? m.localOnly(m.isRemote(remote.map((x) => m[x.part](x.path)).join(m.and), remote.length)) : ''
