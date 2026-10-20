/**
 * Pulizia guidata (amministratori): ciò che col tempo resta indietro in un
 * workspace condiviso. Ogni voce ha la sua azione; nulla si fa da solo.
 * Funzioni pure (l'esistenza dei file allegati si verifica fuori, sul disco).
 */
import dayjs from 'dayjs'
import type { Attachment, Folder, Label, Milestone, Project } from '@/types'
import { lastActivity } from './insights'

export type CleanupFinding =
  | { kind: 'unused_label'; label: Label }
  | { kind: 'empty_folder'; folder: Folder }
  | { kind: 'idle_project'; project: Project; days: number; open: number }
  | { kind: 'missing_file'; project: Project; attachment: Attachment }
  | { kind: 'milestone_done'; project: Project; milestone: Milestone }
  | { kind: 'old_trash'; project: Project; count: number }

export interface CleanupInput {
  projects: Project[]
  labels: Label[]
  folders: Folder[]
  today: string
  /** Allegati di tipo file il cui percorso non esiste (id dell'allegato). */
  missingFiles: Set<string>
  idleDays?: number
  trashDays?: number
}

/** Ultima attività del progetto: la sua modifica più recente o quella di un task. */
export function projectActivity(p: Project): string {
  let last = p.updatedAt
  for (const i of p.items) {
    const a = lastActivity(i)
    if (a > last) last = a
    if (i.completedAt && i.completedAt > last) last = i.completedAt
  }
  return last
}

export function cleanupFindings(x: CleanupInput): CleanupFinding[] {
  const idleDays = x.idleDays ?? 60
  const trashDays = x.trashDays ?? 90
  const out: CleanupFinding[] = []
  const usedLabels = new Set(x.projects.flatMap((p) => p.items.map((i) => i.labelId)).filter(Boolean))
  for (const label of x.labels) if (!usedLabels.has(label.id)) out.push({ kind: 'unused_label', label })
  const hasChild = new Set(x.folders.map((f) => f.parentId).filter(Boolean))
  const hasProject = new Set(x.projects.map((p) => p.folderId).filter(Boolean))
  for (const folder of x.folders) if (!hasChild.has(folder.id) && !hasProject.has(folder.id)) out.push({ kind: 'empty_folder', folder })
  const trashLimit = dayjs(x.today).subtract(trashDays, 'day').toISOString()
  for (const p of x.projects) {
    if (p.trashedAt) continue
    const days = dayjs(x.today).diff(dayjs(projectActivity(p).slice(0, 10)), 'day')
    if (days >= idleDays) out.push({ kind: 'idle_project', project: p, days, open: p.items.filter((i) => i.bucket === 'todo').length })
    for (const a of p.attachments) if (a.kind === 'file' && x.missingFiles.has(a.id)) out.push({ kind: 'missing_file', project: p, attachment: a })
    for (const ms of p.milestones) {
      if (ms.closedAt || !ms.dueDate || ms.dueDate >= x.today) continue
      const mine = p.items.filter((i) => i.milestoneId === ms.id && i.bucket !== 'trash')
      if (mine.length && mine.every((i) => i.bucket === 'done')) out.push({ kind: 'milestone_done', project: p, milestone: ms })
    }
    const old = p.items.filter((i) => i.bucket === 'trash' && !!i.trashedAt && i.trashedAt < trashLimit).length
    if (old) out.push({ kind: 'old_trash', project: p, count: old })
  }
  return out
}
