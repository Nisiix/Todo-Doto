/**
 * Tappe del progetto (versioni, rilasci): avanzamento e note di versione
 * generate dai task completati. Funzioni pure.
 */
import { compareText } from '@/i18n'
import type { Item, Label, Milestone } from '@/types'
import { firstLine } from './items'

export interface MilestoneProgress {
  total: number
  done: number
  todo: number
  /** Task da fare con la scadenza passata. */
  overdue: number
  /** Percentuale completata (0–100), 0 se la tappa è vuota. */
  percent: number
  /** La data obiettivo è passata e ci sono ancora task da fare. */
  late: boolean
}

export function milestoneProgress(m: Pick<Milestone, 'id' | 'dueDate' | 'closedAt'>, items: Item[], today: string): MilestoneProgress {
  const mine = items.filter((i) => i.milestoneId === m.id && i.bucket !== 'trash')
  const done = mine.filter((i) => i.bucket === 'done').length
  const todo = mine.length - done
  return {
    total: mine.length,
    done,
    todo,
    overdue: mine.filter((i) => i.bucket === 'todo' && !!i.dueDate && i.dueDate < today).length,
    percent: mine.length ? Math.round((done / mine.length) * 100) : 0,
    late: !m.closedAt && !!m.dueDate && m.dueDate < today && todo > 0,
  }
}

/** Tappe aperte prima (per data obiettivo, senza data in fondo), poi le chiuse dalla più recente. */
export function sortMilestones<T extends Pick<Milestone, 'name' | 'dueDate' | 'closedAt'>>(ms: T[]): T[] {
  return [...ms].sort((a, b) => {
    if (!!a.closedAt !== !!b.closedAt) return a.closedAt ? 1 : -1
    if (a.closedAt && b.closedAt) return b.closedAt.localeCompare(a.closedAt)
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || compareText(a.name, b.name)
  })
}

export interface ReleaseNotesOptions {
  labels: Pick<Label, 'id' | 'name'>[]
  /** Titolo della sezione «senza etichetta». */
  other: string
  /** Data della sezione (es. la chiusura della tappa o oggi), già formattata. */
  date: string
  code: (item: Item) => string
}

/**
 * Note di versione in Markdown dai task completati della tappa, raggruppati per
 * etichetta (nell'ordine delle etichette, «altro» in fondo), con il codice del
 * task e il commit che l'ha chiuso. Pronte per CHANGELOG.md.
 */
export function releaseNotes(m: Pick<Milestone, 'id' | 'name' | 'notes'>, items: Item[], o: ReleaseNotesOptions): string {
  const done = items.filter((i) => i.milestoneId === m.id && i.bucket === 'done').sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
  const lines = [`## ${m.name} — ${o.date}`, '']
  if (m.notes.trim()) lines.push(m.notes.trim(), '')
  const groups: { title: string; items: Item[] }[] = []
  for (const l of o.labels) {
    const g = done.filter((i) => i.labelId === l.id)
    if (g.length) groups.push({ title: l.name, items: g })
  }
  const known = new Set(o.labels.map((l) => l.id))
  const rest = done.filter((i) => !i.labelId || !known.has(i.labelId))
  if (rest.length) groups.push({ title: o.other, items: rest })
  const many = groups.length > 1
  for (const g of groups) {
    if (many) lines.push(`### ${g.title}`, '')
    for (const i of g.items) {
      const code = o.code(i)
      const commit = i.closedByCommit ? ` (${i.closedByCommit.hash.slice(0, 7)})` : ''
      lines.push(`- ${firstLine(i.title)}${code ? ` — ${code}` : ''}${commit}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

/**
 * Inserisce le note in cima a un CHANGELOG.md esistente: dopo il titolo
 * principale e il suo paragrafo introduttivo, prima della prima sezione `## `.
 * Senza file, il CHANGELOG nasce con un titolo.
 */
export function prependChangelog(existing: string | null, notes: string, title = '# Changelog'): string {
  if (!existing?.trim()) return `${title}\n\n${notes}`
  const lines = existing.split(/\r?\n/)
  const at = lines.findIndex((l) => /^##\s/.test(l))
  if (at < 0) return `${existing.trimEnd()}\n\n${notes}`
  return [...lines.slice(0, at), ...notes.trimEnd().split('\n'), '', ...lines.slice(at)].join('\n')
}
