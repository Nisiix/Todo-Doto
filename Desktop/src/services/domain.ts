/**
 * Accesso con l'account di dominio (Active Directory / Microsoft Entra ID):
 * regole pure per i ruoli dai gruppi. L'identità (dominio, SID, gruppi) la
 * legge il backend dall'account Windows corrente (office.rs → domain_identity).
 */
import type { Role, WorkspaceMeta } from '@/types'

/** Nome del gruppo senza dominio, in minuscolo ("STUDIO\\TodoDoto-Admin" → "tododoto-admin"). */
const bare = (g: string) => (g.includes('\\') ? g.slice(g.lastIndexOf('\\') + 1) : g).trim().toLowerCase()

/** Un gruppo configurato corrisponde a uno dell'utente: col dominio deve coincidere tutto, senza basta il nome. */
export function inGroup(userGroups: string[], configured: string): boolean {
  const c = configured.trim().toLowerCase()
  if (!c) return false
  return userGroups.some((g) => (c.includes('\\') ? g.trim().toLowerCase() === c : bare(g) === c))
}

/**
 * Ruolo dato dai gruppi: Amministratore se in un gruppo degli amministratori,
 * Cleaner se in uno dei cleaner, altrimenti Membro. Null se l'amministratore
 * non ha indicato gruppi (i ruoli restano quelli assegnati a mano).
 */
export function roleFromGroups(dl: WorkspaceMeta['domainLogin'], groups: string[]): Role | null {
  const admin = dl.adminGroups.filter((g) => g.trim())
  const cleaner = dl.cleanerGroups.filter((g) => g.trim())
  if (!admin.length && !cleaner.length) return null
  if (admin.some((g) => inGroup(groups, g))) return 'admin'
  if (cleaner.some((g) => inGroup(groups, g))) return 'cleaner'
  return 'member'
}

/** Account mostrato all'utente: "STUDIO\\mario.rossi" o "mario@PC-UFFICIO". */
export const accountLabel = (u: { domain: string; username: string; hostname: string; sid: string }) =>
  u.sid && u.domain ? `${u.domain}\\${u.username}` : `${u.username}@${u.hostname}`
