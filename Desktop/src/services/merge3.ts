/**
 * Unione a tre vie di un progetto, per le modifiche fatte fuori ufficio.
 *
 *  - base:   il progetto com'era all'ultimo allineamento con la cartella condivisa
 *  - local:  com'è diventato su questo PC, senza rete
 *  - remote: com'è ora nella cartella condivisa (modificato dai colleghi)
 *
 * Si confronta campo per campo: ciò che è cambiato solo qui si porta nella
 * cartella, ciò che è cambiato solo là resta com'è. Se lo stesso campo dello
 * stesso task è cambiato in entrambi i posti (conflitto) vince la versione
 * nella cartella condivisa, che i colleghi hanno già visto, e la propria si
 * mostra nel resoconto, così la si può riapplicare a mano. Nessuna modifica
 * si perde in silenzio.
 *
 * Commenti, domande, risposte e allegati si uniscono per id: si aggiungono
 * quelli nuovi da entrambe le parti; uno tolto da una parte si toglie solo se
 * l'altra non l'ha cambiato. Task nuovi creati offline si aggiungono (con un
 * numero TODO-n libero); un task eliminato da un collega non torna indietro.
 */
import type { Item, Project, Question } from '@/types'
import { firstLine } from './items'
import { normalizeSeq } from './gitLink'

export interface MergeConflict {
  item: string | null
  /** Campo (o gruppo di campi) in conflitto: title, notes, priority, status, label, assignee, bucket, blockedBy, milestone, estimate, checklist, project:<chiave>. */
  field: string
  mine: string
  theirs: string
}
export interface MergeReport {
  /** Modifiche di questo PC portate nella cartella (campi, task nuovi, commenti…). */
  applied: number
  conflicts: MergeConflict[]
  /** Task modificati qui ma eliminati da un collega. */
  dropped: string[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))

/** Campi dei task che cambiano insieme (es. completare = bucket + data). */
const ITEM_GROUPS: { field: string; keys: (keyof Item)[] }[] = [
  { field: 'title', keys: ['title'] },
  { field: 'notes', keys: ['notes'] },
  { field: 'priority', keys: ['priority'] },
  { field: 'status', keys: ['status', 'dueDate', 'confirmedAt'] },
  { field: 'label', keys: ['labelId'] },
  { field: 'assignee', keys: ['assigneeId'] },
  { field: 'bucket', keys: ['bucket', 'completedAt', 'trashedAt', 'closedByCommit'] },
  { field: 'blockedBy', keys: ['blockedBy'] },
  { field: 'milestone', keys: ['milestoneId'] },
  { field: 'estimate', keys: ['estimateHours'] },
  { field: 'checklist', keys: ['checklist'] },
]
/** Campi del progetto che non si uniscono (li gestisce il salvataggio) o che hanno regole proprie. */
const PROJECT_SKIP = new Set(['items', 'version', 'updatedAt', 'updatedBy', 'nextSeq', 'attachments', 'attachmentFolders', 'aiTools', 'schema', 'id'])

function show(item: Item, keys: (keyof Item)[]) {
  return keys
    .map((k) => item[k])
    .filter((v) => v !== null && v !== '' && v !== undefined)
    .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
    .join(' · ')
}

export function mergeProject(base: Project, local: Project, remote: Project): { merged: Project; report: MergeReport } {
  const report: MergeReport = { applied: 0, conflicts: [], dropped: [] }
  const merged = clone(remote)

  /** Unione per id di elenchi annidati (commenti, risposte, allegati…). */
  function mergeList<T extends { id: string }>(b: T[], l: T[], r: T[], mergeOne?: (b: T, l: T, r: T) => T): T[] {
    const bm = byId(b)
    const lm = byId(l)
    const rm = byId(r)
    const out: T[] = []
    for (const x of r) {
      const bx = bm.get(x.id)
      const lx = lm.get(x.id)
      if (bx && !lx) {
        // Tolto qui: si toglie anche là, se nel frattempo non l'ha cambiato nessuno
        if (same(bx, x)) {
          report.applied++
          continue
        }
        out.push(x)
      } else if (bx && lx) {
        if (mergeOne) out.push(mergeOne(bx, lx, x))
        else if (!same(lx, bx) && same(x, bx)) {
          report.applied++
          out.push(clone(lx))
        } else out.push(x)
      } else out.push(x)
    }
    for (const lx of l) {
      if (!bm.has(lx.id) && !rm.has(lx.id)) {
        report.applied++
        out.push(clone(lx))
      }
    }
    return out
  }

  const mergeQuestion = (b: Question, l: Question, r: Question): Question => {
    const q = clone(r)
    if (l.text !== b.text && r.text === b.text) {
      q.text = l.text
      report.applied++
    }
    if ((l.resolved !== b.resolved || l.resolvedAt !== b.resolvedAt) && r.resolved === b.resolved) {
      q.resolved = l.resolved
      q.resolvedAt = l.resolvedAt
      report.applied++
    }
    if (!same(l.decision, b.decision) && same(r.decision, b.decision)) {
      q.decision = clone(l.decision)
      report.applied++
    }
    q.answers = mergeList(b.answers, l.answers, r.answers)
    return q
  }

  function mergeItem(b: Item, l: Item, r: Item): Item {
    const it = clone(r)
    for (const g of ITEM_GROUPS) {
      const pick = (x: Item) => g.keys.map((k) => x[k])
      const mine = pick(l)
      if (same(mine, pick(b))) continue // non cambiato qui
      if (same(pick(r), pick(b)) || same(pick(r), mine)) {
        for (const k of g.keys) (it as Record<string, unknown>)[k] = clone(l[k])
        if (!same(pick(r), mine)) report.applied++
      } else {
        report.conflicts.push({ item: firstLine(r.title), field: g.field, mine: show(l, g.keys), theirs: show(r, g.keys) })
      }
    }
    it.comments = mergeList(b.comments, l.comments, r.comments)
    it.questions = mergeList(b.questions, l.questions, r.questions, mergeQuestion)
    if (!same(it, r)) it.updatedAt = l.updatedAt ?? it.updatedAt
    return it
  }

  // Task
  const bItems = byId(base.items)
  const lItems = byId(local.items)
  const rItems = byId(remote.items)
  const items: Item[] = []
  for (const r of remote.items) {
    const b = bItems.get(r.id)
    const l = lItems.get(r.id)
    if (b && !l) {
      // Eliminato definitivamente qui (svuotando il cestino)
      if (same(b, r)) {
        report.applied++
        continue
      }
      items.push(r)
    } else if (b && l) items.push(mergeItem(b, l, r))
    else items.push(r)
  }
  const usedSeq = new Set(remote.items.map((i) => i.seq).filter(Boolean))
  for (const l of local.items) {
    const b = bItems.get(l.id)
    if (b && !rItems.has(l.id)) {
      if (!same(b, l)) report.dropped.push(firstLine(l.title))
      continue
    }
    if (!b && !rItems.has(l.id)) {
      const it = clone(l)
      if (usedSeq.has(it.seq)) it.seq = 0 // numero già preso da un task di un collega: se ne assegna uno libero
      items.push(it)
      report.applied++
    }
  }
  merged.items = items
  normalizeSeq(merged)

  // Allegati, cartelle degli allegati, strumenti IA: per id
  merged.attachments = mergeList(base.attachments, local.attachments, remote.attachments)
  merged.attachmentFolders = mergeList(base.attachmentFolders, local.attachmentFolders, remote.attachmentFolders)
  merged.aiTools = mergeList(base.aiTools, local.aiTools, remote.aiTools)

  // Altri campi del progetto (descrizione, membri, stack…): interi
  const rec = (x: Project) => x as unknown as Record<string, unknown>
  for (const k of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (PROJECT_SKIP.has(k)) continue
    const bv = rec(base)[k]
    const lv = rec(local)[k]
    const rv = rec(remote)[k]
    if (same(lv, bv)) continue
    if (same(rv, bv)) {
      rec(merged)[k] = clone(lv)
      report.applied++
    } else if (!same(rv, lv)) {
      report.conflicts.push({ item: null, field: `project:${k}`, mine: typeof lv === 'string' ? lv : JSON.stringify(lv), theirs: typeof rv === 'string' ? rv : JSON.stringify(rv) })
    }
  }
  return { merged, report }
}
