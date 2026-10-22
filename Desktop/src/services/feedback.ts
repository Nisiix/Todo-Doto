/**
 * Feedback e nuove versioni (0.7.0): indirizzi precompilati per segnalare un
 * problema, proporre un'idea, fare una domanda o scrivere all'autore, e il
 * confronto con l'ultima versione pubblicata su GitHub. Funzioni pure.
 *
 * Nei link vanno solo la versione dell'app, la lingua e il sistema: niente
 * nomi di workspace, progetti o persone.
 */
import { AUTHOR_EMAIL, REPO_URL } from './branding'

export interface AppInfo {
  version: string
  /** Es. «Windows 11», «Windows» o lo user agent abbreviato. */
  os: string
  locale: string
}

export type FeedbackKind = 'bug' | 'idea' | 'question' | 'email'

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

/** Indirizzo da aprire per ogni tipo di feedback (modelli in .github/ISSUE_TEMPLATE e DISCUSSION_TEMPLATE). */
export function feedbackUrl(kind: FeedbackKind, info: AppInfo, subject: (kind: FeedbackKind) => string, body = ''): string {
  if (kind === 'bug') return `${REPO_URL}/issues/new?${query({ template: 'bug_report.yml', version: info.version, os: info.os })}`
  if (kind === 'idea') return `${REPO_URL}/discussions/new?${query({ category: 'ideas', version: info.version })}`
  if (kind === 'question') return `${REPO_URL}/discussions/new?${query({ category: 'q-a', version: info.version })}`
  const text = `${body}\n\n—\nTodo Doto ${info.version} · ${info.os} · ${info.locale}`
  return `mailto:${AUTHOR_EMAIL}?${query({ subject: subject(kind), body: text })}`
}

/** Sistema operativo in breve, dallo user agent (per i link di feedback). */
export function osLabel(ua: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return ''
}

// ---------------------------------------------------------------------------
// Nuove versioni
// ---------------------------------------------------------------------------

/** Parti numeriche di una versione («v0.10.2» → [0, 10, 2]); null se non è una versione. */
export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim())
  return m ? m.slice(1, 4).map(Number) : null
}

/** `a` è più recente di `b`? Le versioni non valide non sono mai più recenti. */
export function isNewer(a: string, b: string): boolean {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return false
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!
  return false
}

export interface ReleaseInfo {
  version: string
  url: string
  publishedAt: string
  /** Prime righe delle note della Release (testo semplice). */
  notes: string
}

/** Dalla risposta di `releases/latest`: solo Release pubblicate, non bozze né anteprime. */
export function parseRelease(raw: unknown): ReleaseInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { tag_name?: unknown; html_url?: unknown; published_at?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown }
  if (r.draft || r.prerelease || typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) return null
  const url = typeof r.html_url === 'string' && r.html_url.startsWith(`${REPO_URL}/`) ? r.html_url : `${REPO_URL}/releases`
  return {
    version: r.tag_name.replace(/^v/, ''),
    url,
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
    notes: typeof r.body === 'string' ? r.body.trim().slice(0, 600) : '',
  }
}

/** Un controllo al giorno basta. */
export const CHECK_EVERY_MS = 24 * 3_600_000
export const isCheckDue = (lastCheck: string, now = Date.now()) => !lastCheck || now - Date.parse(lastCheck) >= CHECK_EVERY_MS || Number.isNaN(Date.parse(lastCheck))
