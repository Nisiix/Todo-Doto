/**
 * Google Drive, in sola lettura.
 *
 * - Accesso con OAuth 2.0 + PKCE da app desktop: il browser di sistema apre la
 *   pagina di consenso Google e torna su http://127.0.0.1:<porta> (ricevitore in
 *   Rust). Scope minimo: drive.readonly.
 * - Il token viene conservato cifrato sulla macchina (vedi config.ts), mai nel
 *   workspace condiviso: ogni collega usa il proprio account Google.
 * - Nel workspace si replica solo la struttura (nomi, id, tipi, link): drive.json.
 *
 * Questo modulo non dipende da Vue: riceve una funzione `fetch` (plugin http in
 * Tauri, window.fetch altrove) e il ricevitore OAuth.
 */
import { DRIVE_FOLDER_MIME, type DriveNode } from '@/types'
import { t } from '@/i18n'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface DriveTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number // ms epoch
  scope: string
}

export interface DriveConfig {
  clientId: string
  clientSecret: string // per i client "Desktop app" di Google non è un segreto vero e proprio
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/drive/v3'

// --- PKCE -------------------------------------------------------------------

function base64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createPkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}

export const randomState = () => base64url(crypto.getRandomValues(new Uint8Array(16)))

export function buildAuthUrl(opts: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
    state: opts.state,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${AUTH_URL}?${q}`
}

/** Estrae l'id di una cartella da un link Drive (o restituisce l'id così com'è). */
export function parseFolderId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const m = /\/folders\/([A-Za-z0-9_-]+)/.exec(s) ?? /[?&]id=([A-Za-z0-9_-]+)/.exec(s)
  if (m) return m[1]!
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null
}

// --- client -----------------------------------------------------------------

export const GOOGLE_EXPORT: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.drawing': { mime: 'image/png', ext: 'png' },
}
export const isGoogleNative = (mime: string) => mime.startsWith('application/vnd.google-apps.') && mime !== DRIVE_FOLDER_MIME

export class DriveError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message)
  }
}

export class DriveClient {
  constructor(
    private fetchFn: FetchFn,
    private config: DriveConfig,
    private tokens: DriveTokens | null,
    private onTokens: (t: DriveTokens | null) => Promise<void> | void,
  ) {}

  get connected() {
    return !!this.tokens
  }

  // --- token ---------------------------------------------------------------

  private async tokenRequest(params: Record<string, string>): Promise<DriveTokens> {
    const body = new URLSearchParams({ client_id: this.config.clientId, ...params })
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret)
    const res = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new DriveError(String(json.error_description ?? json.error ?? `Google ha risposto ${res.status}`), res.status)
    return {
      accessToken: String(json.access_token),
      refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : (this.tokens?.refreshToken ?? null),
      expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 - 30_000,
      scope: String(json.scope ?? DRIVE_SCOPE),
    }
  }

  async exchangeCode(code: string, verifier: string, redirectUri: string) {
    this.tokens = await this.tokenRequest({ code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri })
    await this.onTokens(this.tokens)
  }

  private async accessToken(): Promise<string> {
    if (!this.tokens) throw new DriveError(t('Account Google non collegato.'), 401)
    if (Date.now() < this.tokens.expiresAt) return this.tokens.accessToken
    if (!this.tokens.refreshToken) throw new DriveError(t('Sessione Google scaduta: collega di nuovo l’account.'), 401)
    this.tokens = await this.tokenRequest({ refresh_token: this.tokens.refreshToken, grant_type: 'refresh_token' })
    await this.onTokens(this.tokens)
    return this.tokens.accessToken
  }

  async disconnect() {
    const t = this.tokens
    this.tokens = null
    await this.onTokens(null)
    if (t?.refreshToken || t?.accessToken) {
      // Revoca best effort: se fallisce il token scade comunque da solo
      await this.fetchFn(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refreshToken ?? t.accessToken)}`, { method: 'POST' }).catch(() => {})
    }
  }

  // --- API -----------------------------------------------------------------

  private async api(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.accessToken()
    const res = await this.fetchFn(`${API}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } })
    if (res.status === 401) throw new DriveError(t('Accesso a Google non più valido: collega di nuovo l’account.'), 401)
    if (res.status === 403) throw new DriveError(t('Google ha negato l’accesso a questo elemento.'), 403)
    if (res.status === 404) throw new DriveError(t('Elemento non trovato su Google Drive (cancellato o non condiviso con te).'), 404)
    if (!res.ok) throw new DriveError(`Google Drive ha risposto ${res.status}.`, res.status)
    return res
  }

  async whoAmI(): Promise<{ email: string; name: string }> {
    const j = (await (await this.api('/about?fields=user(emailAddress,displayName)')).json()) as { user: { emailAddress: string; displayName: string } }
    return { email: j.user.emailAddress, name: j.user.displayName }
  }

  async folderInfo(folderId: string): Promise<{ id: string; name: string; mimeType: string }> {
    return (await (await this.api(`/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`)).json()) as {
      id: string
      name: string
      mimeType: string
    }
  }

  private async listChildren(folderId: string): Promise<DriveNode[]> {
    const out: DriveNode[] = []
    let pageToken: string | undefined
    do {
      const q = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)',
        pageSize: '200',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        orderBy: 'folder,name',
      })
      if (pageToken) q.set('pageToken', pageToken)
      const j = (await (await this.api(`/files?${q}`)).json()) as {
        nextPageToken?: string
        files: { id: string; name: string; mimeType: string; modifiedTime?: string; size?: string; webViewLink?: string }[]
      }
      for (const f of j.files)
        out.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          parentId: folderId,
          modifiedTime: f.modifiedTime ?? '',
          size: f.size ? Number(f.size) : null,
          webViewLink: f.webViewLink ?? null,
        })
      pageToken = j.nextPageToken
    } while (pageToken)
    return out
  }

  /** Replica ricorsivamente la struttura della cartella (solo metadati). */
  async walkFolder(rootId: string, onProgress?: (count: number) => void): Promise<DriveNode[]> {
    const nodes: DriveNode[] = []
    const queue = [rootId]
    while (queue.length) {
      const children = await this.listChildren(queue.shift()!)
      for (const c of children) {
        nodes.push({ ...c, parentId: c.parentId === rootId ? null : c.parentId })
        if (c.mimeType === DRIVE_FOLDER_MIME) queue.push(c.id)
      }
      onProgress?.(nodes.length)
    }
    return nodes
  }

  /** Contenuto di un file: download diretto, oppure esportazione per i documenti Google. */
  async fetchContent(node: { id: string; name: string; mimeType: string }): Promise<{ bytes: Uint8Array; name: string; mime: string }> {
    const exp = GOOGLE_EXPORT[node.mimeType]
    if (exp) {
      const res = await this.api(`/files/${encodeURIComponent(node.id)}/export?mimeType=${encodeURIComponent(exp.mime)}`)
      return { bytes: new Uint8Array(await res.arrayBuffer()), name: `${node.name}.${exp.ext}`, mime: exp.mime }
    }
    if (isGoogleNative(node.mimeType)) throw new DriveError(t('Questo tipo di documento Google non ha un’anteprima: aprilo su Drive.'))
    const res = await this.api(`/files/${encodeURIComponent(node.id)}?alt=media&supportsAllDrives=true`)
    return { bytes: new Uint8Array(await res.arrayBuffer()), name: node.name, mime: node.mimeType }
  }
}
