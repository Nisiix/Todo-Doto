/**
 * Configurazione dei PC: dagli esiti delle verifiche dei prerequisiti (Stack ›
 * Configura sul tuo PC) all'esito condiviso per progetto, e da lì a "chi ha
 * una configurazione incompleta". Funzioni pure.
 */
import { needsAction, isSatisfied, type CheckResult } from './prereqCheck'
import { resolveStack, varsFor } from './scaffold'
import type { Prerequisite, Project, ReadinessEntry, ReadinessFile, ReadinessMissing, User } from '@/types'

/** Prerequisiti del progetto come li vede lo Stack (con i segnaposto risolti). */
export const prereqsOf = (p: Pick<Project, 'name' | 'stack'>): Prerequisite[] => resolveStack(p.stack, varsFor(p.name)).prerequisites

/** Dopo quanto un esito non si considera più attuale (il PC potrebbe essere cambiato). */
export const READINESS_MAX_AGE_DAYS = 30

/** Impronta stabile dei prerequisiti: cambia se se ne aggiunge, toglie o modifica uno. */
export function prereqHash(prereqs: Pick<Prerequisite, 'id' | 'name' | 'version' | 'check'>[]): string {
  const text = prereqs.map((p) => `${p.id}|${p.name.trim()}|${p.version.trim()}|${p.check.trim()}`).join('\n')
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * Esito per progetto dagli esiti delle singole verifiche. `null` se non c'è
 * niente di utile da condividere (es. nessuna verifica eseguibile su questo PC).
 */
export function buildEntry(prereqs: Prerequisite[], results: Record<string, CheckResult | undefined>, now = new Date().toISOString()): ReadinessEntry | null {
  if (!prereqs.length) return null
  const missing: ReadinessMissing[] = []
  let ok = 0
  let uncertain = 0
  let known = 0
  for (const p of prereqs) {
    const r = results[p.id]
    if (!r) return null // verifica non ancora finita
    if (r.status !== 'unavailable') known++
    if (needsAction(r.status)) missing.push({ name: p.name, status: r.status as ReadinessMissing['status'], found: r.version, required: p.version })
    else if (isSatisfied(r.status)) ok++
    else uncertain++
  }
  if (!known) return null
  return { checkedAt: now, hash: prereqHash(prereqs), missing, ok, uncertain }
}

/** Firma di ciò che manca: la stessa mancanza non genera una seconda notifica. */
export const missingSignature = (e: Pick<ReadinessEntry, 'missing'>) =>
  e.missing.map((x) => `${x.name}:${x.status}`).sort().join(',')

/** L'esito vale ancora: stessi prerequisiti e non troppo vecchio. */
export function isCurrent(e: ReadinessEntry, hash: string, now = Date.now()): boolean {
  return e.hash === hash && now - Date.parse(e.checkedAt) <= READINESS_MAX_AGE_DAYS * 86_400_000
}

export interface IncompleteUser {
  user: User
  entry: ReadinessEntry
  host: string
}

/**
 * Utenti con una configurazione incompleta per il progetto: quelli che lo
 * vedono, con un esito attuale in cui manca (o è vecchio) almeno un prerequisito.
 * Chi non ha ancora verificato non compare: non si sa.
 */
export function incompleteUsers(
  projectId: string,
  prereqs: Prerequisite[],
  users: User[],
  files: Record<string, ReadinessFile>,
  canUserSee: (u: User) => boolean,
  now = Date.now(),
): IncompleteUser[] {
  if (!prereqs.length) return []
  const hash = prereqHash(prereqs)
  const out: IncompleteUser[] = []
  for (const user of users) {
    const f = files[user.id]
    const entry = f?.projects[projectId]
    if (!entry || !entry.missing.length || !isCurrent(entry, hash, now) || !canUserSee(user)) continue
    out.push({ user, entry, host: f.host })
  }
  return out.sort((a, b) => b.entry.missing.length - a.entry.missing.length || a.user.displayName.localeCompare(b.user.displayName))
}

/** Il file cambia davvero? (si scrive solo se sì, per non svegliare gli altri PC) */
export function sameEntry(a: ReadinessEntry | undefined, b: ReadinessEntry): boolean {
  return !!a && a.hash === b.hash && a.ok === b.ok && a.uncertain === b.uncertain && missingSignature(a) === missingSignature(b) &&
    JSON.stringify(a.missing) === JSON.stringify(b.missing)
}
