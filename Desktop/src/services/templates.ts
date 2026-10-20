/**
 * Modelli di progetto: si salva un progetto come modello (Stack, cartelle degli
 * allegati, tappe, task con le date relative al suo inizio) e si crea un
 * progetto nuovo da lì, con le date spostate a partire da oggi. Funzioni pure.
 */
import dayjs from 'dayjs'
import type { Item, Milestone, Project, ProjectTemplate } from '@/types'
import { newId } from './ids'

const day = (iso: string) => dayjs(iso.slice(0, 10))
const offset = (from: string, date: string | null) => (date ? day(date).diff(day(from), 'day') : null)

/** Il modello di un progetto: i task non cestinati tornano «da fare» (dei ripetuti solo l'occorrenza aperta), le date diventano giorni dall'inizio. */
export function templateFromProject(p: Project, o: { name: string; description?: string; by: string; now: string; id?: string }): ProjectTemplate {
  const start = p.createdAt
  const milestones = p.milestones.map((x) => ({ name: x.name, notes: x.notes, dueOffset: offset(start, x.dueDate) }))
  const msIndex = new Map(p.milestones.map((x, i) => [x.id, i]))
  return {
    id: o.id ?? newId('ptp'),
    name: o.name.trim(),
    description: (o.description ?? p.description).trim(),
    createdAt: o.now,
    createdBy: o.by,
    stack: JSON.parse(JSON.stringify(p.stack)),
    attachmentFolders: p.attachmentFolders.map((f) => f.name),
    milestones,
    tasks: p.items
      // Di un task che si ripete conta solo l'occorrenza da fare (quella completata ha già la successiva)
      .filter((i) => i.bucket !== 'trash' && !(i.bucket === 'done' && i.repeat !== 'none'))
      .sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt))
      .map((i) => ({
        title: i.title,
        notes: i.notes,
        priority: i.priority,
        status: i.status,
        labelId: i.labelId,
        estimateHours: i.estimateHours,
        checklist: i.checklist.map((c) => c.text),
        repeat: i.repeat,
        dueOffset: offset(start, i.dueDate),
        milestone: i.milestoneId !== null && msIndex.has(i.milestoneId) ? msIndex.get(i.milestoneId)! : null,
      })),
  }
}

export interface MaterializedTemplate {
  stack: ProjectTemplate['stack']
  attachmentFolders: string[]
  milestones: Milestone[]
  tasks: (Partial<Item> & { title: string })[]
}

/**
 * Ciò che il modello aggiunge a un progetto che inizia `today`: le scadenze
 * passate (offset negativi) diventano oggi; una scadenza su un task che non è
 * Confermato si ignora (la regola dello stato vale anche qui).
 */
export function materializeTemplate(t: ProjectTemplate, today: string, now: string): MaterializedTemplate {
  const at = (n: number | null) => (n === null ? null : dayjs(today).add(Math.max(0, n), 'day').format('YYYY-MM-DD'))
  const milestones: Milestone[] = t.milestones.map((x) => ({ id: newId('mst'), name: x.name, notes: x.notes, dueDate: at(x.dueOffset), closedAt: null, createdAt: now }))
  return {
    stack: JSON.parse(JSON.stringify(t.stack)),
    attachmentFolders: [...t.attachmentFolders],
    milestones,
    tasks: t.tasks.map((x) => ({
      title: x.title,
      notes: x.notes,
      priority: x.priority,
      status: x.status,
      labelId: x.labelId,
      estimateHours: x.estimateHours,
      checklist: x.checklist.map((text) => ({ id: newId('chk'), text, done: false })),
      repeat: x.repeat,
      dueDate: x.status === 'confermato' ? at(x.dueOffset) : null,
      milestoneId: x.milestone !== null ? (milestones[x.milestone]?.id ?? null) : null,
    })),
  }
}
