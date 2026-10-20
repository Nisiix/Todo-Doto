/**
 * Integrazione con l'ufficio (backend Rust: src-tauri/src/office.rs):
 * VPN di Windows, account di dominio, invio email con Outlook o SMTP, e
 * messaggi nei canali di Microsoft Teams tramite un Workflow.
 *
 * Nell'anteprima nel browser e nei test le stesse funzioni si simulano con
 * `window.__pgmOffice`; senza simulazione rispondono "unsupported".
 */
import { isTauri } from './fs'
import { getHttp } from './http'

export interface VpnInfo {
  name: string
  connected: boolean
  allUsers: boolean
}
export interface DomainIdentity {
  /** Vuoto per un account locale del PC. */
  domain: string
  user: string
  sid: string
  groups: string[]
}
export interface MailMessage {
  to: string[]
  subject: string
  html: string
  text: string
}
export type SmtpSecurity = 'starttls' | 'tls' | 'none'
export interface SmtpConfig {
  host: string
  port: number
  security: SmtpSecurity
  from: string
  user: string
  password: string
}
export interface ActionResult {
  ok: boolean
  code: number | null
  message: string
}

interface OfficeFake {
  vpnList?: () => VpnInfo[] | Promise<VpnInfo[]>
  vpnConnect?: (name: string) => ActionResult | Promise<ActionResult>
  domainIdentity?: () => DomainIdentity | Promise<DomainIdentity>
  mailOutlook?: (m: MailMessage) => ActionResult | Promise<ActionResult>
  mailSmtp?: (c: SmtpConfig, m: MailMessage) => ActionResult | Promise<ActionResult>
  teams?: (url: string, body: unknown) => number | Promise<number>
}
const fake = (): OfficeFake | undefined => (typeof window !== 'undefined' ? (window as unknown as { __pgmOffice?: OfficeFake }).__pgmOffice : undefined)

async function invoke<T>(cmd: string, args: Record<string, unknown>, fallback: ((f: OfficeFake) => Promise<T> | T | undefined) | null): Promise<T> {
  if (isTauri) {
    const core = await import('@tauri-apps/api/core')
    return core.invoke<T>(cmd, args)
  }
  const f = fake()
  const r = f && fallback ? await fallback(f) : undefined
  if (r === undefined) throw new Error('unsupported')
  return r
}

export const vpnList = () => invoke<VpnInfo[]>('vpn_list', {}, (f) => f.vpnList?.())
export const vpnConnect = (name: string) => invoke<ActionResult>('vpn_connect', { name }, (f) => f.vpnConnect?.(name))
export const domainIdentity = () => invoke<DomainIdentity>('domain_identity', {}, (f) => f.domainIdentity?.())
export const mailOutlook = (message: MailMessage) => invoke<ActionResult>('mail_outlook', { message }, (f) => f.mailOutlook?.(message))
export const mailSmtp = (config: SmtpConfig, message: MailMessage) => invoke<ActionResult>('mail_smtp', { config, message }, (f) => f.mailSmtp?.(config, message))

/** Codici di rasdial per cui servono le credenziali (si apre il pannello VPN di Windows). */
export const VPN_NEEDS_CREDENTIALS = new Set([691, 703, 718, 812])

/** Indirizzo email plausibile (stessa regola del backend). */
export function isEmail(s: string): boolean {
  const t = s.trim()
  const at = t.split('@')
  return at.length === 2 && !!at[0] && /\./.test(at[1]!) && !/^\.|\.$/.test(at[1]!) && t.length <= 254 && /^[A-Za-z0-9._%+\-@']+$/.test(t)
}

/**
 * Indirizzi accettati per i messaggi a Teams: i Workflow di Power Automate
 * («Pubblica in un canale quando viene ricevuta una richiesta webhook») e i
 * vecchi connettori Webhook in ingresso. Solo https, nessun altro dominio.
 */
const TEAMS_HOSTS = [/\.logic\.azure\.com$/i, /\.webhook\.office\.com$/i, /\.powerplatform\.com$/i, /\.powerautomate\.com$/i]
export function isTeamsWebhook(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' && !u.username && !u.password && TEAMS_HOSTS.some((h) => h.test(u.hostname))
  } catch {
    return false
  }
}

/** Invia una scheda (Adaptive Card) a un Workflow di Teams. */
export async function postTeams(url: string, card: unknown): Promise<boolean> {
  if (!isTeamsWebhook(url)) return false
  const body = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }] }
  const f = fake()
  if (!isTauri && f?.teams) return (await f.teams(url, body)) < 300
  if (!isTauri) return false
  const http = await getHttp()
  const r = await http(url.trim(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.status < 300
}

/** Link mailto: (fase 1, nessuna rete): oggetto e testo, con il testo tagliato a una lunghezza sicura. */
export function mailtoLink(to: string[], subject: string, text: string): string {
  const max = 1800
  const body = text.length > max ? `${text.slice(0, max)}\n…` : text
  return `mailto:${to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
