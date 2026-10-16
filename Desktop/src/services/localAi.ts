/**
 * IA locale: un motore installato su questo PC (Ollama, oppure un server
 * compatibile OpenAI come LM Studio o Foundry Local), raggiunto SOLO su
 * 127.0.0.1 / localhost / ::1. In Tauri le richieste passano dal backend
 * (ai.rs), che rifiuta qualunque altro indirizzo, ignora i proxy e non segue i
 * redirect: nessun dato può uscire dal PC.
 *
 * Nell'anteprima nel browser (e nei test) le risposte si possono simulare con
 * `window.__pgmAi`; senza simulazione si usa il fetch del browser, sempre e
 * solo verso indirizzi locali.
 */
import type { ZodType, ZodTypeDef } from 'zod'
import { isTauri } from './fs'
import type { AiConfig, AiProvider } from '@/types'

export const DEFAULT_BASE_URL: Record<AiProvider, string> = {
  ollama: 'http://127.0.0.1:11434',
  openai: 'http://127.0.0.1:1234/v1',
}
/** Modello consigliato: Qwen 3 4B (Apache 2.0), buon compromesso tra qualità e risorse (circa 2,5 GB). */
export const RECOMMENDED_MODEL = 'qwen3:4b'
/** Modello per gli embedding (circa 270 MB). */
export const RECOMMENDED_EMBED_MODEL = 'nomic-embed-text'

export type AiErrorCode = 'not-local' | 'unreachable' | 'timeout' | 'http' | 'invalid' | 'cancelled' | 'no-model' | 'too-large'

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message?: string,
  ) {
    super(message ?? code)
  }
}

/** Stesse regole del backend: solo http(s), solo loopback, niente credenziali nell'indirizzo. */
export function isLocalUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host === '[::1]') return true
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  return !!m && m.slice(1).every((x) => Number(x) <= 255)
}

export const baseUrlOf = (cfg: Pick<AiConfig, 'provider' | 'baseUrl'>) => (cfg.baseUrl.trim() || DEFAULT_BASE_URL[cfg.provider]).replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// Trasporto
// ---------------------------------------------------------------------------

export interface AiHttpRequest {
  url: string
  method?: 'GET' | 'POST' | 'DELETE'
  body?: string
  timeoutMs?: number
}
export interface AiHttpResponse {
  status: number
  body: string
}
/** Simulazione per anteprima e test: `request` per le chiamate singole, `stream` (righe NDJSON) per lo scaricamento dei modelli. */
export interface AiFake {
  request(req: AiHttpRequest): AiHttpResponse | Promise<AiHttpResponse>
  stream?(req: AiHttpRequest): string[] | Promise<string[]>
}
const fake = (): AiFake | undefined => (typeof window !== 'undefined' ? (window as unknown as { __pgmAi?: AiFake }).__pgmAi : undefined)

const toAiError = (e: unknown): AiError => {
  if (e instanceof AiError) return e
  const msg = e instanceof Error ? e.message : String(e)
  if (['not-local', 'unreachable', 'timeout', 'cancelled', 'too-large'].includes(msg)) return new AiError(msg as AiErrorCode)
  if (/abort/i.test(msg)) return new AiError('timeout')
  if (/fetch|network|connect|refused/i.test(msg)) return new AiError('unreachable', msg)
  return new AiError('http', msg)
}

async function send(req: AiHttpRequest): Promise<AiHttpResponse> {
  if (!isLocalUrl(req.url)) throw new AiError('not-local')
  try {
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<AiHttpResponse>('ai_request', { req })
    }
    const f = fake()
    if (f) return await f.request(req)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), req.timeoutMs ?? 120_000)
    try {
      const r = await window.fetch(req.url, {
        method: req.method ?? (req.body ? 'POST' : 'GET'),
        body: req.body,
        headers: req.body ? { 'content-type': 'application/json' } : undefined,
        redirect: 'manual',
        signal: ctl.signal,
      })
      return { status: r.status, body: await r.text() }
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    throw toAiError(e)
  }
}

let streamSeq = 0
/** Streaming riga per riga (NDJSON); `signal` interrompe. */
async function sendStream(req: AiHttpRequest, onLine: (line: string) => void, signal?: AbortSignal): Promise<number> {
  if (!isLocalUrl(req.url)) throw new AiError('not-local')
  if (signal?.aborted) throw new AiError('cancelled')
  try {
    if (isTauri) {
      const { invoke, Channel } = await import('@tauri-apps/api/core')
      const id = `s${Date.now()}-${++streamSeq}`
      const channel = new Channel<string>()
      channel.onmessage = onLine
      const stop = () => void invoke('ai_cancel', { id })
      signal?.addEventListener('abort', stop, { once: true })
      try {
        return await invoke<number>('ai_stream', { req, id, onLine: channel })
      } finally {
        signal?.removeEventListener('abort', stop)
      }
    }
    const f = fake()
    if (f) {
      const lines = f.stream ? await f.stream(req) : []
      for (const l of lines) {
        if (signal?.aborted) throw new AiError('cancelled')
        onLine(l)
        await new Promise((r) => setTimeout(r, 0))
      }
      return 200
    }
    const r = await window.fetch(req.url, { method: 'POST', body: req.body, headers: { 'content-type': 'application/json' }, redirect: 'manual', signal })
    const reader = r.body?.getReader()
    const dec = new TextDecoder()
    let pending = ''
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      pending += dec.decode(value, { stream: true })
      let i: number
      while ((i = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, i).trim()
        pending = pending.slice(i + 1)
        if (line) onLine(line)
      }
    }
    if (pending.trim()) onLine(pending.trim())
    return r.status
  } catch (e) {
    if (signal?.aborted) throw new AiError('cancelled')
    throw toAiError(e)
  }
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  const r = await send({ url, method: 'GET', timeoutMs })
  if (r.status < 200 || r.status >= 300) throw new AiError('http', `HTTP ${r.status}: ${r.body.slice(0, 200)}`)
  try {
    return JSON.parse(r.body) as T
  } catch {
    throw new AiError('invalid')
  }
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const r = await send({ url, method: 'POST', body: JSON.stringify(body), timeoutMs })
  if (r.status < 200 || r.status >= 300) {
    let detail = r.body.slice(0, 300)
    try {
      const j = JSON.parse(r.body) as { error?: string | { message?: string } }
      detail = typeof j.error === 'string' ? j.error : (j.error?.message ?? detail)
    } catch {
      /* corpo non JSON */
    }
    if (r.status === 404 && /model/i.test(detail)) throw new AiError('no-model', detail)
    throw new AiError('http', `HTTP ${r.status}: ${detail}`)
  }
  try {
    return JSON.parse(r.body) as T
  } catch {
    throw new AiError('invalid')
  }
}

// ---------------------------------------------------------------------------
// Stato del motore e modelli
// ---------------------------------------------------------------------------

/** Il nome indicato corrisponde a un modello installato ("qwen3:4b" = "qwen3:4b", "nomic-embed-text" = "nomic-embed-text:latest"). */
export function hasModel(installed: string[], name: string): boolean {
  const n = name.trim().toLowerCase()
  if (!n) return false
  const full = n.includes(':') ? n : `${n}:latest`
  return installed.some((m) => {
    const x = m.toLowerCase()
    return x === n || x === full || x.split('/').pop() === n
  })
}

export interface ProbeResult {
  ok: boolean
  /** Modelli installati nel motore. */
  models: string[]
  hasModel: boolean
  hasEmbedModel: boolean
  version?: string
  error?: AiErrorCode
  detail?: string
}

/** Il motore risponde? Quali modelli ha? Non scarica né modifica nulla. */
export async function probe(cfg: AiConfig, timeoutMs = 4_000): Promise<ProbeResult> {
  const base = baseUrlOf(cfg)
  if (!isLocalUrl(base)) return { ok: false, models: [], hasModel: false, hasEmbedModel: false, error: 'not-local' }
  try {
    let models: string[]
    let version: string | undefined
    if (cfg.provider === 'ollama') {
      const tags = await getJson<{ models?: { name?: string; model?: string }[] }>(`${base}/api/tags`, timeoutMs)
      models = (tags.models ?? []).map((m) => m.name ?? m.model ?? '').filter(Boolean)
      version = await getJson<{ version?: string }>(`${base}/api/version`, timeoutMs)
        .then((v) => v.version)
        .catch(() => undefined)
    } else {
      const list = await getJson<{ data?: { id?: string }[] }>(`${base}/models`, timeoutMs)
      models = (list.data ?? []).map((m) => m.id ?? '').filter(Boolean)
    }
    return { ok: true, models, hasModel: hasModel(models, cfg.model), hasEmbedModel: hasModel(models, cfg.embedModel), version }
  } catch (e) {
    const err = toAiError(e)
    return { ok: false, models: [], hasModel: false, hasEmbedModel: false, error: err.code, detail: err.message }
  }
}

export interface PullProgress {
  status: string
  completed: number
  total: number
}

/**
 * Scarica un modello con Ollama (`/api/pull`): è Ollama a scaricarlo dal suo
 * catalogo, l'app parla solo con Ollama su questo PC. `onProgress` riceve
 * l'avanzamento; `signal` interrompe (Ollama riprende da dove era rimasto).
 */
export async function pullModel(cfg: AiConfig, model: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
  if (cfg.provider !== 'ollama') throw new AiError('http', 'pull-unsupported')
  let error = ''
  let success = false
  const status = await sendStream(
    { url: `${baseUrlOf(cfg)}/api/pull`, method: 'POST', body: JSON.stringify({ model, stream: true }), timeoutMs: 120_000 },
    (line) => {
      try {
        const j = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string }
        if (j.error) error = j.error
        if (j.status === 'success') success = true
        onProgress({ status: j.status ?? '', completed: j.completed ?? 0, total: j.total ?? 0 })
      } catch {
        /* riga non JSON: si ignora */
      }
    },
    signal,
  )
  if (error) throw new AiError(/not found|does not exist|manifest/i.test(error) ? 'no-model' : 'http', error)
  if (status < 200 || status >= 300 || !success) throw new AiError('http', `HTTP ${status}`)
}

// ---------------------------------------------------------------------------
// Risposte strutturate
// ---------------------------------------------------------------------------

/** Toglie il ragionamento (<think>…</think>), i recinti ``` e il testo attorno al JSON. */
export function extractJson(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (fence) t = fence[1]!.trim()
  const start = t.search(/[[{]/)
  if (start < 0) return t
  const open = t[start]
  const end = t.lastIndexOf(open === '{' ? '}' : ']')
  return end > start ? t.slice(start, end + 1) : t.slice(start)
}

export interface ChatJsonOptions<T> {
  system: string
  user: string
  /** Schema JSON della risposta: il motore è vincolato a rispettarlo. */
  schema: Record<string, unknown>
  /** Verifica finale (zod): ciò che non la supera viene scartato. */
  validate: ZodType<T, ZodTypeDef, unknown>
  timeoutMs?: number
  /** Contesto massimo in token (Ollama). */
  numCtx?: number
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

async function chatOnce(cfg: AiConfig, messages: ChatMessage[], schema: Record<string, unknown>, timeoutMs: number, numCtx: number): Promise<string> {
  const base = baseUrlOf(cfg)
  if (cfg.provider === 'ollama') {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      stream: false,
      format: schema,
      think: false,
      keep_alive: '10m',
      options: { temperature: 0, num_ctx: numCtx },
    }
    try {
      const r = await postJson<{ message?: { content?: string } }>(`${base}/api/chat`, body, timeoutMs)
      return r.message?.content ?? ''
    } catch (e) {
      // Modelli senza "ragionamento": alcune versioni rifiutano il campo think
      if (e instanceof AiError && e.code === 'http' && /think/i.test(e.message)) {
        delete body.think
        const r = await postJson<{ message?: { content?: string } }>(`${base}/api/chat`, body, timeoutMs)
        return r.message?.content ?? ''
      }
      throw e
    }
  }
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: { name: 'result', schema, strict: true } },
  }
  try {
    const r = await postJson<{ choices?: { message?: { content?: string } }[] }>(`${base}/chat/completions`, body, timeoutMs)
    return r.choices?.[0]?.message?.content ?? ''
  } catch (e) {
    // Server che non conoscono json_schema: si chiede il JSON solo con il testo (e lo si verifica comunque)
    if (e instanceof AiError && e.code === 'http' && /response_format|json_schema|400/i.test(e.message)) {
      delete body.response_format
      const r = await postJson<{ choices?: { message?: { content?: string } }[] }>(`${base}/chat/completions`, body, timeoutMs)
      return r.choices?.[0]?.message?.content ?? ''
    }
    throw e
  }
}

/**
 * Domanda al modello con risposta JSON vincolata allo schema e verificata con
 * zod. Se la prima risposta non è valida si riprova una volta; poi errore
 * "invalid" (chi chiama ignora il risultato).
 */
export async function chatJson<T>(cfg: AiConfig, opts: ChatJsonOptions<T>): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 300_000
  const numCtx = opts.numCtx ?? 8_192
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]
  let last = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chatOnce(cfg, messages, opts.schema, timeoutMs, numCtx)
    let parsed: unknown
    try {
      parsed = JSON.parse(extractJson(text))
    } catch {
      last = 'JSON non valido'
      messages.push({ role: 'assistant', content: text.slice(0, 4000) }, { role: 'user', content: 'The previous answer was not valid JSON. Answer again with JSON only, matching the schema.' })
      continue
    }
    const r = opts.validate.safeParse(parsed)
    if (r.success) return r.data
    last = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    messages.push({ role: 'assistant', content: text.slice(0, 4000) }, { role: 'user', content: `The previous answer did not match the schema (${last.slice(0, 300)}). Answer again with JSON only.` })
  }
  throw new AiError('invalid', last)
}

// ---------------------------------------------------------------------------
// Embedding (somiglianza tra testi)
// ---------------------------------------------------------------------------

/** Vettori dei testi con il modello di embedding (a blocchi di 32). */
export async function embed(cfg: AiConfig, texts: string[], timeoutMs = 120_000): Promise<number[][]> {
  const base = baseUrlOf(cfg)
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 32) {
    const input = texts.slice(i, i + 32).map((t) => t.slice(0, 2000))
    let vecs: number[][]
    if (cfg.provider === 'ollama') {
      const r = await postJson<{ embeddings?: number[][] }>(`${base}/api/embed`, { model: cfg.embedModel, input, keep_alive: '10m' }, timeoutMs)
      vecs = r.embeddings ?? []
    } else {
      const r = await postJson<{ data?: { embedding?: number[]; index?: number }[] }>(`${base}/embeddings`, { model: cfg.embedModel, input }, timeoutMs)
      vecs = [...(r.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding ?? [])
    }
    if (vecs.length !== input.length || vecs.some((v) => !Array.isArray(v) || !v.length)) throw new AiError('invalid')
    out.push(...vecs)
  }
  return out
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
