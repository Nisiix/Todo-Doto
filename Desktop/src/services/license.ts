/**
 * Piani, funzionalità e licenze.
 *
 * La licenza è un file `license.json` nella cartella del workspace, firmato
 * Ed25519 con la chiave privata di chi vende l'app (scripts/issue-license.mjs
 * o il server licenze). Qui c'è solo la chiave pubblica: la verifica avviene
 * in locale, senza rete, così funziona anche in una LAN chiusa.
 *
 * Senza licenza valida il workspace è nel piano Free. Un workspace di rete
 * con più utenti di quelli del piano può avviare una prova di 14 giorni
 * (file `trial.json`); alla scadenza gli utenti senza posto passano in sola
 * lettura. Nessun dato viene mai bloccato o cancellato.
 *
 * Tutto ciò che è qui è logica pura e testabile (license.test.ts).
 */
import * as ed from '@noble/ed25519'
import dayjs, { type Dayjs } from 'dayjs'
import type { License, TrialFile, User } from '@/types'
import { t, tn } from '@/i18n'

/** Chiave pubblica Ed25519 (hex) corrispondente a ~/.pgm/license-signing.key di chi emette le licenze. */
export const LICENSE_PUBLIC_KEY = '68221ba3ad0c0bb04653d233bf2db5a1e0e1893fcdbe5ce3cf98d73d9b72085a'

export const TRIAL_DAYS = 14

export type PlanId = 'free' | 'team' | 'business'

export const FEATURES = [
  'restrictedProjects', // progetti visibili solo ad alcune persone
  'cleanerRole', // ruolo Cleaner
  'audit', // cronologia operazioni
  'auditUnlimited', // cronologia senza limite di 90 giorni + export
  'export', // export CSV e stampa/PDF
  'drive', // replica cartella Google Drive
  'backup', // snapshot automatici del workspace
  'timeline', // vista timeline (futura)
] as const
export type Feature = (typeof FEATURES)[number]

export const FEATURE_LABEL: Record<Feature, string> = {
  restrictedProjects: 'Progetti riservati ad alcune persone',
  cleanerRole: 'Ruolo Cleaner',
  audit: 'Cronologia delle operazioni',
  auditUnlimited: 'Cronologia illimitata con export',
  export: 'Export CSV e stampa/PDF',
  drive: 'Replica di una cartella Google Drive',
  backup: 'Backup automatici del workspace',
  timeline: 'Timeline delle scadenze',
}

export interface PlanInfo {
  id: PlanId
  label: string
  /** Utenti di un workspace di rete che possono scrivere (null = illimitati). */
  seats: number | null
  /** Giorni di cronologia consultabili (null = illimitata). */
  auditDays: number | null
  features: Feature[]
  /** Prezzo indicativo, solo per i testi dell'interfaccia. */
  price: string
}

export const PLANS: Record<PlanId, PlanInfo> = {
  free: { id: 'free', label: 'Free', seats: 3, auditDays: 0, features: [], price: 'Gratis' },
  team: {
    id: 'team',
    label: 'Team',
    seats: 10,
    auditDays: 90,
    features: ['restrictedProjects', 'cleanerRole', 'audit', 'export', 'drive', 'backup'],
    price: '49,90 €/anno o 5,90 €/mese per workspace',
  },
  business: {
    id: 'business',
    label: 'Business',
    seats: null,
    auditDays: null,
    features: ['restrictedProjects', 'cleanerRole', 'audit', 'auditUnlimited', 'export', 'drive', 'backup', 'timeline'],
    price: '149,90 €/anno o 14,90 €/mese per workspace',
  },
}

/** «10 posti» oppure «posti illimitati». */
export const seatsLabel = (seats: number | null) => (seats === null ? t('posti illimitati') : tn(seats, '1 posto', '{n} posti'))

/** Piano minimo che include la funzionalità (per i testi «Disponibile nel piano …»). */
export function planFor(feature: Feature): PlanId {
  if (PLANS.team.features.includes(feature)) return 'team'
  return 'business'
}

// ---------------------------------------------------------------------------
// Verifica della firma
// ---------------------------------------------------------------------------

/** JSON canonico: chiavi ordinate ricorsivamente, nessuno spazio (identico a scripts/license-lib.mjs). */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const fromHex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)))
function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export type VerifyResult = { ok: true; license: License } | { ok: false; reason: string }

/**
 * Controlla struttura e firma di una licenza. `publicKey` è parametrico solo
 * per i test; l'app usa sempre LICENSE_PUBLIC_KEY.
 */
export async function verifyLicense(raw: unknown, publicKey = LICENSE_PUBLIC_KEY): Promise<VerifyResult> {
  const { LicenseSchema } = await import('@/types')
  const parsed = LicenseSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: t('Il file non ha il formato di una licenza.') }
  const { sig, ...payload } = parsed.data
  try {
    const msg = new TextEncoder().encode(canonical(stripUndefined(payload)))
    const valid = await ed.verifyAsync(fromB64(sig), msg, fromHex(publicKey))
    return valid ? { ok: true, license: parsed.data } : { ok: false, reason: t('La firma della licenza non è valida.') }
  } catch {
    return { ok: false, reason: t('La firma della licenza non è leggibile.') }
  }
}

/** zod aggiunge chiavi assenti come undefined: non devono entrare nel JSON canonico. */
function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/** Estrae il JSON da un testo incollato (tollera spazi e testo attorno). */
export function parseLicenseText(text: string): unknown {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(t('Nessuna licenza trovata nel testo.'))
  return JSON.parse(trimmed.slice(start, end + 1))
}

// ---------------------------------------------------------------------------
// Stato effettivo del piano
// ---------------------------------------------------------------------------

export interface PlanState {
  plan: PlanId
  source: 'license' | 'trial' | 'free'
  seats: number | null
  /** Licenza presente (anche se scaduta), per mostrarne i dettagli. */
  license: License | null
  licenseStatus: 'none' | 'valid' | 'expired'
  trialDaysLeft: number
  trialActive: boolean
  trialUsed: boolean
}

export const isExpired = (license: License, today: Dayjs) => license.expiresAt < today.format('YYYY-MM-DD')

export function trialDaysLeft(trial: TrialFile | null, today: Dayjs): number {
  if (!trial) return 0
  const end = dayjs(trial.startedAt).add(TRIAL_DAYS, 'day')
  return Math.max(0, Math.ceil(end.diff(today, 'day', true)))
}

export function effectivePlan(license: License | null, trial: TrialFile | null, today = dayjs()): PlanState {
  const days = trialDaysLeft(trial, today)
  const trialActive = days > 0
  if (license && !isExpired(license, today)) {
    return {
      plan: license.plan,
      source: 'license',
      seats: license.seats,
      license,
      licenseStatus: 'valid',
      trialDaysLeft: days,
      trialActive,
      trialUsed: !!trial,
    }
  }
  if (trialActive) {
    return {
      plan: 'team',
      source: 'trial',
      seats: PLANS.team.seats,
      license,
      licenseStatus: license ? 'expired' : 'none',
      trialDaysLeft: days,
      trialActive: true,
      trialUsed: true,
    }
  }
  return {
    plan: 'free',
    source: 'free',
    seats: PLANS.free.seats,
    license,
    licenseStatus: license ? 'expired' : 'none',
    trialDaysLeft: 0,
    trialActive: false,
    trialUsed: !!trial,
  }
}

export const canUse = (plan: PlanId, feature: Feature) => PLANS[plan].features.includes(feature)

/**
 * Chi ha un posto in un workspace di rete: prima gli amministratori (così chi
 * gestisce il workspace non resta mai bloccato), poi gli altri per data di
 * ingresso. Chi è fuori lavora in sola lettura.
 */
export function seatHolders(users: User[], seats: number | null): Set<string> {
  if (seats === null) return new Set(users.map((u) => u.id))
  const ordered = [...users].sort(
    (a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.createdAt.localeCompare(b.createdAt),
  )
  return new Set(ordered.slice(0, seats).map((u) => u.id))
}

/** Testo breve per banner e impostazioni. */
export function describePlan(s: PlanState): string {
  const p = PLANS[s.plan].label
  if (s.source === 'license') return t('{plan} · fino al {date}', { plan: p, date: dayjs(s.license!.expiresAt).format('D MMM YYYY') })
  if (s.source === 'trial') return t('{plan} in prova · {left}', { plan: p, left: tn(s.trialDaysLeft, '1 giorno rimasto', '{n} giorni rimasti') })
  return s.licenseStatus === 'expired' ? t('Free · licenza scaduta') : 'Free'
}
