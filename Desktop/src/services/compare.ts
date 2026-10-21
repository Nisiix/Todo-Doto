/**
 * Cosa è cambiato tra due date (0.7.0): confronta due stati del workspace (due
 * copie di sicurezza, o una copia e lo stato attuale) e descrive le differenze
 * che contano: task aggiunti, completati o riaperti, cestinati o ripristinati,
 * eliminati, con la scadenza spostata («da → a») o passati ad altri; progetti
 * nuovi, rinominati, cestinati, ripristinati o eliminati.
 *
 * È un confronto di stati, non un elenco di eventi: chi sposta una scadenza tre
 * volte compare una volta, con la prima e l'ultima data. Funzioni pure.
 */
import { firstLine } from './items'
import type { Item, Project } from '@/types'

export const ITEM_CHANGES = ['added', 'completed', 'reopened', 'due', 'assignee', 'trashed', 'restored', 'deleted'] as const
export type ItemChangeKind = (typeof ITEM_CHANGES)[number]
export const PROJECT_CHANGES = ['project_added', 'project_renamed', 'project_trashed', 'project_restored', 'project_deleted'] as const
export type ProjectChangeKind = (typeof PROJECT_CHANGES)[number]

export interface ItemChange {
  kind: ItemChangeKind
  projectId: string
  itemId: string
  seq: number
  title: string
  /** Scadenza o assegnatario prima e dopo (solo per «due» e «assignee»). */
  from?: string | null
  to?: string | null
}
export interface ProjectChange {
  kind: ProjectChangeKind
  projectId: string
  name: string
  /** Nome di prima, se rinominato. */
  from?: string
}
export interface ProjectDiff {
  projectId: string
  name: string
  project: ProjectChange[]
  items: ItemChange[]
}
export interface Comparison {
  projects: ProjectDiff[]
  counts: Record<ItemChangeKind | ProjectChangeKind, number>
  total: number
}

type Snap = Pick<Project, 'id' | 'name' | 'items' | 'trashedAt'>

const zero = () => Object.fromEntries([...ITEM_CHANGES, ...PROJECT_CHANGES].map((k) => [k, 0])) as Comparison['counts']

function itemChanges(projectId: string, before: Item[], after: Item[]): ItemChange[] {
  const out: ItemChange[] = []
  const old = new Map(before.map((i) => [i.id, i]))
  const base = (i: Item) => ({ projectId, itemId: i.id, seq: i.seq, title: firstLine(i.title) })
  for (const i of after) {
    const o = old.get(i.id)
    old.delete(i.id)
    if (!o) {
      if (i.bucket !== 'trash') out.push({ ...base(i), kind: 'added' })
      continue
    }
    if (o.bucket !== i.bucket) {
      if (i.bucket === 'trash') out.push({ ...base(i), kind: 'trashed' })
      else if (o.bucket === 'trash') out.push({ ...base(i), kind: 'restored' })
      else out.push({ ...base(i), kind: i.bucket === 'done' ? 'completed' : 'reopened' })
    }
    if (i.bucket === 'trash') continue
    if ((o.dueDate ?? null) !== (i.dueDate ?? null)) out.push({ ...base(i), kind: 'due', from: o.dueDate, to: i.dueDate })
    if ((o.assigneeId ?? null) !== (i.assigneeId ?? null)) out.push({ ...base(i), kind: 'assignee', from: o.assigneeId, to: i.assigneeId })
  }
  // Rimasti: eliminati definitivamente (quelli già nel cestino prima non interessano più)
  for (const o of old.values()) if (o.bucket !== 'trash') out.push({ ...base(o), kind: 'deleted' })
  return out
}

/** Differenze fra `before` e `after`, per progetto (i progetti con modifiche, in ordine di nome). */
export function compareStates(before: Snap[], after: Snap[], compareNames: (a: string, b: string) => number = (a, b) => a.localeCompare(b)): Comparison {
  const counts = zero()
  const out: ProjectDiff[] = []
  const old = new Map(before.map((p) => [p.id, p]))
  const push = (d: ProjectDiff) => {
    if (!d.project.length && !d.items.length) return
    for (const c of [...d.project, ...d.items]) counts[c.kind]++
    out.push(d)
  }
  for (const p of after) {
    const o = old.get(p.id)
    old.delete(p.id)
    const d: ProjectDiff = { projectId: p.id, name: p.name, project: [], items: [] }
    if (!o) {
      d.project.push({ kind: 'project_added', projectId: p.id, name: p.name })
      d.items = itemChanges(p.id, [], p.items)
    } else {
      if (o.name !== p.name) d.project.push({ kind: 'project_renamed', projectId: p.id, name: p.name, from: o.name })
      if (!o.trashedAt && p.trashedAt) d.project.push({ kind: 'project_trashed', projectId: p.id, name: p.name })
      if (o.trashedAt && !p.trashedAt) d.project.push({ kind: 'project_restored', projectId: p.id, name: p.name })
      d.items = itemChanges(p.id, o.items, p.items)
    }
    push(d)
  }
  for (const o of old.values()) push({ projectId: o.id, name: o.name, project: [{ kind: 'project_deleted', projectId: o.id, name: o.name }], items: [] })
  out.sort((a, b) => compareNames(a.name, b.name))
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return { projects: out, counts, total }
}

/** Copia di partenza proposta: la più recente di almeno `days` giorni fa, altrimenti la più vecchia. */
export function defaultFrom<T extends { at: Date }>(list: T[], now = new Date(), days = 7): T | null {
  if (!list.length) return null
  const limit = now.getTime() - days * 86_400_000
  const sorted = [...list].sort((a, b) => b.at.getTime() - a.at.getTime())
  return sorted.find((b) => b.at.getTime() <= limit) ?? sorted[sorted.length - 1]!
}
