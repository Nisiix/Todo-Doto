/**
 * Riepilogo numerico del workspace per la pagina Analisi e generazione dello
 * script di configurazione Windows dalla sezione Stack. Funzioni pure.
 */
import dayjs from 'dayjs'
import { PRIORITIES, STATUSES, type Bucket, type Priority, type Project, type Stack, type Status } from '@/types'
import { compareText } from '@/i18n'
import { common } from '@/i18n/common'

export interface UserLoad {
  userId: string | null // null = non assegnato
  todo: number
  immediata: number
  overdue: number
  done: number
}

export interface ProjectLoad {
  id: string
  name: string
  todo: number
  done: number
  trash: number
  immediata: number
  overdue: number
  openQuestions: number
}

export interface WorkspaceSummary {
  projects: { active: number; trashed: number; favorites: number }
  items: Record<Bucket, number>
  byStatus: Record<Status, number> // solo "da fare"
  byPriority: Record<Priority, number> // solo "da fare"
  overdue: number
  dueSoon: number // entro 7 giorni
  withoutDue: number
  openQuestions: number
  byUser: UserLoad[]
  byProject: ProjectLoad[]
}

const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>

/** Riepilogo di tutti i progetti attivi (i cestinati contano solo nel totale progetti). */
export function summarize(projects: Project[], today: string, favoriteIds: string[] = []): WorkspaceSummary {
  const active = projects.filter((p) => !p.trashedAt)
  const soonLimit = dayjs(today).add(7, 'day').format('YYYY-MM-DD')
  const s: WorkspaceSummary = {
    projects: { active: active.length, trashed: projects.length - active.length, favorites: active.filter((p) => favoriteIds.includes(p.id)).length },
    items: { todo: 0, done: 0, trash: 0 },
    byStatus: zero(STATUSES),
    byPriority: zero(PRIORITIES),
    overdue: 0,
    dueSoon: 0,
    withoutDue: 0,
    openQuestions: 0,
    byUser: [],
    byProject: [],
  }
  const loads = new Map<string | null, UserLoad>()
  const load = (id: string | null) => {
    let l = loads.get(id)
    if (!l) loads.set(id, (l = { userId: id, todo: 0, immediata: 0, overdue: 0, done: 0 }))
    return l
  }

  for (const p of active) {
    const pl: ProjectLoad = { id: p.id, name: p.name, todo: 0, done: 0, trash: 0, immediata: 0, overdue: 0, openQuestions: 0 }
    for (const i of p.items) {
      s.items[i.bucket]++
      pl[i.bucket]++
      if (i.bucket === 'todo') {
        s.byStatus[i.status]++
        s.byPriority[i.priority]++
        const overdue = !!i.dueDate && i.dueDate < today
        if (overdue) {
          s.overdue++
          pl.overdue++
        } else if (!i.dueDate) s.withoutDue++
        else if (i.dueDate <= soonLimit) s.dueSoon++
        if (i.priority === 'immediata') pl.immediata++
        const q = i.questions.filter((x) => !x.resolved).length
        s.openQuestions += q
        pl.openQuestions += q
        const l = load(i.assigneeId)
        l.todo++
        if (i.priority === 'immediata') l.immediata++
        if (overdue) l.overdue++
      } else if (i.bucket === 'done' && i.assigneeId) load(i.assigneeId).done++
    }
    s.byProject.push(pl)
  }
  s.byUser = [...loads.values()].sort((a, b) => {
    if (a.userId === null) return 1
    if (b.userId === null) return -1
    return b.todo - a.todo || b.immediata - a.immediata || b.done - a.done
  })
  s.byProject.sort((a, b) => b.todo - a.todo || compareText(a.name, b.name))
  return s
}

// ---------------------------------------------------------------------------
// Script di configurazione per Windows (.cmd)
// ---------------------------------------------------------------------------

/** Sottoinsieme dello Stack che serve allo script (gli id non contano). */
export interface ScriptStack {
  prerequisites: Array<Pick<Stack['prerequisites'][number], 'name' | 'version' | 'check' | 'url'>>
  steps: Array<Pick<Stack['steps'][number], 'title' | 'kind' | 'command' | 'cwd' | 'url' | 'notes'>>
  envVars: Array<Pick<Stack['envVars'][number], 'key' | 'example'> & { notes?: string }>
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`

/**
 * Traduce prerequisiti, passi e variabili d'ambiente in un file batch che
 * esegue tutto in sequenza: verifica i prerequisiti, lancia i comandi nella
 * cartella indicata, apre i link, si ferma sui passi manuali.
 */
export function setupScriptWindows(projectName: string, stack: ScriptStack, opts: { baseDir?: string } = {}): string {
  const S = common.script
  const L: string[] = []
  L.push('@echo off', 'setlocal EnableExtensions', `title ${S.title(projectName)}`, 'echo.', `echo === ${S.heading(projectName)} ===`, 'echo.')
  // Cartella del progetto: i comandi (e le cartelle relative dei passi) partono da qui
  const base = opts.baseDir?.trim()
  if (base) L.push(`if not exist ${q(base)} mkdir ${q(base)}`, `cd /d ${q(base)} || goto fail`, `echo ${S.workdir}: %CD%`, 'echo.')

  if (stack.prerequisites.length) {
    L.push(`echo --- ${S.prerequisites} ---`)
    for (const p of stack.prerequisites) {
      const label = p.version ? `${p.name} ${p.version}` : p.name
      const hint = p.url ? S.installFrom(p.name, p.url) : S.install(p.name)
      if (p.check.trim()) L.push(`echo [${S.check}] ${label}`, `${p.check.trim()} || echo    ${S.missing}: ${hint}`)
      else L.push(`echo [${S.required}] ${label} - ${hint}`)
    }
    L.push('echo.')
  }

  if (stack.envVars.length) {
    L.push(`echo --- ${S.envVars} ---`)
    for (const v of stack.envVars) L.push(`echo ${v.key}=${v.example}${v.notes ? `   (${v.notes})` : ''}`)
    L.push('echo.')
  }

  stack.steps.forEach((st, idx) => {
    const n = idx + 1
    L.push(`echo --- ${S.step(n, st.title)} ---`)
    if (st.notes.trim()) L.push(`echo ${st.notes.trim()}`)
    if (st.kind === 'command') {
      if (st.cwd.trim()) L.push(`pushd ${q(st.cwd.trim())} || goto fail`)
      for (const line of st.command.split('\n').map((l) => l.trim()).filter(Boolean)) L.push(`call ${line} || goto fail`)
      if (st.cwd.trim()) L.push('popd')
    } else if (st.kind === 'link') {
      if (st.url.trim()) L.push(`start "" ${q(st.url.trim())}`)
      L.push(`echo ${S.linkPause}`, 'pause >nul')
    } else {
      L.push(`echo ${S.manualPause}`, 'pause >nul')
    }
    L.push('echo.')
  })

  L.push(`echo === ${S.done} ===`, 'pause', 'exit /b 0', '', ':fail', 'echo.', `echo ${S.failed}`, 'pause', 'exit /b 1')
  return L.join('\r\n') + '\r\n'
}
