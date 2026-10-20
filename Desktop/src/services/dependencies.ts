/**
 * Dipendenze tra task dello stesso progetto: «bloccato da TODO-7».
 *
 *  - un task è bloccato finché almeno uno dei suoi bloccanti è da fare (un
 *    bloccante completato o nel cestino non blocca più);
 *  - le dipendenze non possono formare un ciclo (A aspetta B che aspetta A);
 *  - una scadenza prima di quella di un bloccante è un conflitto da segnalare;
 *  - la catena critica è la sequenza più lunga di bloccanti ancora da fare:
 *    è quella che decide quando finisce il lavoro.
 *
 * Funzioni pure: nessuna dipendenza da Vue o dallo store.
 */
import type { Item } from '@/types'

type Dep = Pick<Item, 'id' | 'blockedBy' | 'bucket'>

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]))

/** Bloccanti ancora da fare (quelli eliminati definitivamente si ignorano). */
export function openBlockers<T extends Dep>(item: Pick<Item, 'blockedBy'>, items: T[]): T[] {
  const map = byId(items)
  return item.blockedBy.map((id) => map.get(id)).filter((b): b is T => !!b && b.bucket === 'todo')
}

export const isBlocked = (item: Pick<Item, 'blockedBy' | 'bucket'>, items: Dep[]) => item.bucket === 'todo' && openBlockers(item, items).length > 0

/** Task che aspettano questo (lo hanno tra i bloccanti). */
export const blockedByThis = <T extends Dep>(itemId: string, items: T[]): T[] => items.filter((i) => i.blockedBy.includes(itemId))

/** Aggiungere `blockerId` ai bloccanti di `itemId` creerebbe un ciclo (o è il task stesso)? */
export function wouldCycle(items: Dep[], itemId: string, blockerId: string): boolean {
  if (itemId === blockerId) return true
  const map = byId(items)
  // Si risale dal bloccante: se tra i suoi bloccanti (anche indiretti) c'è il task, è un ciclo
  const seen = new Set<string>()
  const stack = [blockerId]
  while (stack.length) {
    const id = stack.pop()!
    if (id === itemId) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const b of map.get(id)?.blockedBy ?? []) stack.push(b)
  }
  return false
}

/** Task che possono diventare bloccanti: da fare, non già bloccanti, senza creare cicli. */
export function blockerCandidates<T extends Dep>(item: Dep, items: T[]): T[] {
  return items.filter((c) => c.bucket === 'todo' && c.id !== item.id && !item.blockedBy.includes(c.id) && !wouldCycle(items, item.id, c.id))
}

/** Bloccanti da fare con una scadenza successiva a quella del task: il task non può finire in tempo. */
export function dueConflicts<T extends Dep & Pick<Item, 'dueDate'>>(item: Pick<Item, 'blockedBy' | 'dueDate'>, items: T[]): T[] {
  if (!item.dueDate) return []
  return openBlockers(item, items).filter((b) => !!b.dueDate && b.dueDate > item.dueDate!)
}

/**
 * Catena critica: la sequenza più lunga di task da fare legati da dipendenze,
 * dal primo bloccante all'ultimo bloccato. Vuota se non ci sono dipendenze aperte.
 */
export function criticalChain<T extends Dep>(items: T[]): T[] {
  const open = items.filter((i) => i.bucket === 'todo')
  const map = byId(open)
  const memo = new Map<string, string[]>()
  // Catena più lunga che termina in `id` (risalendo i bloccanti); i cicli (file modificati a mano) si spezzano
  const longest = (id: string, path: Set<string>): string[] => {
    const cached = memo.get(id)
    if (cached) return cached
    let best: string[] = []
    for (const b of map.get(id)?.blockedBy ?? []) {
      if (!map.has(b) || path.has(b)) continue
      path.add(b)
      const c = longest(b, path)
      path.delete(b)
      if (c.length > best.length) best = c
    }
    const out = [...best, id]
    memo.set(id, out)
    return out
  }
  let chain: string[] = []
  for (const i of open) {
    const c = longest(i.id, new Set([i.id]))
    if (c.length > chain.length) chain = c
  }
  return chain.length > 1 ? chain.map((id) => map.get(id)!) : []
}

/** Task sbloccati passando da `prev` a `next` (l'ultimo bloccante è stato completato o cestinato). */
export function newlyUnblocked<T extends Dep>(prev: T[], next: T[]): T[] {
  const before = byId(prev)
  return next.filter((i) => {
    const old = before.get(i.id)
    return i.bucket === 'todo' && i.blockedBy.length > 0 && !!old && isBlocked(old, prev) && !isBlocked(i, next)
  })
}

/** Toglie dai bloccanti gli id di task che non esistono più (eliminati definitivamente). */
export function pruneBlockers(items: Dep[]): boolean {
  const ids = new Set(items.map((i) => i.id))
  let changed = false
  for (const i of items) {
    const kept = i.blockedBy.filter((b) => ids.has(b) && b !== i.id)
    if (kept.length !== i.blockedBy.length) {
      i.blockedBy = kept
      changed = true
    }
  }
  return changed
}
