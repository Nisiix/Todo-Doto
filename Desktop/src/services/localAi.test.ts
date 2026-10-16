import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AiError, baseUrlOf, chatJson, cosine, embed, extractJson, hasModel, isLocalUrl, probe, pullModel, type AiFake, type AiHttpRequest } from './localAi'
import { DEFAULT_AI_CONFIG, type AiConfig } from '@/types'

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({ ...DEFAULT_AI_CONFIG, enabled: true, ...over })
const setFake = (f: AiFake | undefined) => Object.assign(window, { __pgmAi: f })
afterEach(() => setFake(undefined))

/** Ollama simulato: registra le richieste e risponde secondo `routes`. */
function fake(routes: Record<string, (req: AiHttpRequest) => unknown>, stream?: string[]) {
  const calls: AiHttpRequest[] = []
  setFake({
    request(req) {
      calls.push(req)
      const path = new URL(req.url).pathname
      const h = routes[path]
      if (!h) return { status: 404, body: JSON.stringify({ error: 'not found' }) }
      const r = h(req)
      return typeof r === 'object' && r && 'status' in r ? (r as { status: number; body: string }) : { status: 200, body: JSON.stringify(r) }
    },
    stream: stream ? (req) => (calls.push(req), stream) : undefined,
  })
  return calls
}

describe('indirizzi consentiti', () => {
  it('solo questo PC', () => {
    for (const ok of ['http://127.0.0.1:11434', 'http://localhost:1234/v1', 'http://[::1]:11434/api', 'https://127.0.0.1:5273']) expect(isLocalUrl(ok), ok).toBe(true)
    for (const bad of ['http://192.168.1.5:11434', 'https://ollama.com', 'http://localhost.evil.com', 'http://127.0.0.1.nip.io', 'http://u:p@127.0.0.1:11434', 'file:///c:/x', 'http://0.0.0.0:11434', 'nonsense'])
      expect(isLocalUrl(bad), bad).toBe(false)
  })
  it('indirizzo predefinito per motore, senza barra finale', () => {
    expect(baseUrlOf({ provider: 'ollama', baseUrl: '' })).toBe('http://127.0.0.1:11434')
    expect(baseUrlOf({ provider: 'openai', baseUrl: '' })).toBe('http://127.0.0.1:1234/v1')
    expect(baseUrlOf({ provider: 'openai', baseUrl: 'http://localhost:5273/v1/' })).toBe('http://localhost:5273/v1')
  })
  it('un indirizzo esterno non parte nemmeno', async () => {
    const calls = fake({ '/api/tags': () => ({ models: [] }) })
    const r = await probe(cfg({ baseUrl: 'https://api.example.com' }))
    expect(r).toMatchObject({ ok: false, error: 'not-local' })
    expect(calls).toHaveLength(0)
  })
})

describe('stato del motore', () => {
  it('riconosce i modelli installati, anche con :latest', () => {
    expect(hasModel(['qwen3:4b', 'nomic-embed-text:latest'], 'qwen3:4b')).toBe(true)
    expect(hasModel(['nomic-embed-text:latest'], 'nomic-embed-text')).toBe(true)
    expect(hasModel(['qwen3:8b'], 'qwen3:4b')).toBe(false)
    expect(hasModel(['qwen3:4b'], '')).toBe(false)
  })
  it('Ollama: modelli e versione', async () => {
    fake({ '/api/tags': () => ({ models: [{ name: 'qwen3:4b' }] }), '/api/version': () => ({ version: '0.12.0' }) })
    expect(await probe(cfg())).toEqual({ ok: true, models: ['qwen3:4b'], hasModel: true, hasEmbedModel: false, version: '0.12.0' })
  })
  it('compatibile OpenAI: /models', async () => {
    fake({ '/v1/models': () => ({ data: [{ id: 'qwen3-4b' }] }) })
    const r = await probe(cfg({ provider: 'openai', model: 'qwen3-4b' }))
    expect(r.ok && r.hasModel).toBe(true)
  })
  it('motore spento: "unreachable"', async () => {
    setFake({
      request() {
        throw new Error('unreachable')
      },
    })
    expect(await probe(cfg())).toMatchObject({ ok: false, error: 'unreachable' })
  })
})

describe('scaricamento dei modelli', () => {
  it('riporta l’avanzamento fino a "success"', async () => {
    const calls = fake({}, ['{"status":"pulling manifest"}', '{"status":"pulling","completed":50,"total":100}', '{"status":"success"}'])
    const seen: number[] = []
    await pullModel(cfg(), 'qwen3:4b', (p) => seen.push(p.completed))
    expect(seen).toEqual([0, 50, 0])
    expect(JSON.parse(calls[0]!.body!)).toEqual({ model: 'qwen3:4b', stream: true })
  })
  it('errore di Ollama → errore', async () => {
    fake({}, ['{"error":"pull model manifest: file does not exist"}'])
    await expect(pullModel(cfg(), 'inesistente', () => {})).rejects.toMatchObject({ code: 'no-model' })
  })
  it('si interrompe con Annulla', async () => {
    fake({}, ['{"status":"pulling","completed":1,"total":100}', '{"status":"pulling","completed":2,"total":100}', '{"status":"success"}'])
    const ctl = new AbortController()
    await expect(pullModel(cfg(), 'qwen3:4b', () => ctl.abort(), ctl.signal)).rejects.toMatchObject({ code: 'cancelled' })
  })
})

describe('risposte strutturate', () => {
  const Schema = z.object({ items: z.array(z.string()) })
  const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'string' } } }, required: ['items'] }

  it('toglie ragionamento e recinti', () => {
    expect(extractJson('<think>bla</think>\n```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJson('Ecco: {"a":[1,2]} fine')).toBe('{"a":[1,2]}')
  })
  it('Ollama: vincola lo schema, temperatura 0, niente ragionamento', async () => {
    const calls = fake({ '/api/chat': () => ({ message: { content: '{"items":["a"]}' } }) })
    expect(await chatJson(cfg(), { system: 's', user: 'u', schema, validate: Schema })).toEqual({ items: ['a'] })
    const body = JSON.parse(calls[0]!.body!)
    expect(body).toMatchObject({ model: 'qwen3:4b', stream: false, format: schema, think: false, options: { temperature: 0 } })
    expect(body.messages.map((x: { role: string }) => x.role)).toEqual(['system', 'user'])
  })
  it('riprova una volta se la risposta non rispetta lo schema, poi rinuncia', async () => {
    let n = 0
    fake({ '/api/chat': () => ({ message: { content: ++n === 1 ? '{"items":"no"}' : '{"items":["ok"]}' } }) })
    expect(await chatJson(cfg(), { system: 's', user: 'u', schema, validate: Schema })).toEqual({ items: ['ok'] })
    fake({ '/api/chat': () => ({ message: { content: 'non è JSON' } }) })
    await expect(chatJson(cfg(), { system: 's', user: 'u', schema, validate: Schema })).rejects.toBeInstanceOf(AiError)
  })
  it('compatibile OpenAI: response_format json_schema, e senza se il server non lo conosce', async () => {
    const calls = fake({
      '/v1/chat/completions': (req) =>
        JSON.parse(req.body!).response_format ? { status: 400, body: '{"error":{"message":"response_format not supported"}}' } : { choices: [{ message: { content: '{"items":[]}' } }] },
    })
    expect(await chatJson(cfg({ provider: 'openai' }), { system: 's', user: 'u', schema, validate: Schema })).toEqual({ items: [] })
    expect(JSON.parse(calls[0]!.body!).response_format.type).toBe('json_schema')
    expect(JSON.parse(calls[1]!.body!).response_format).toBeUndefined()
  })
})

describe('embedding', () => {
  it('Ollama /api/embed a blocchi, somiglianza coseno', async () => {
    const calls = fake({ '/api/embed': (req) => ({ embeddings: (JSON.parse(req.body!).input as string[]).map((t) => [t.length, 1]) }) })
    const v = await embed(cfg(), Array.from({ length: 40 }, (_, i) => 'x'.repeat(i + 1)))
    expect(v).toHaveLength(40)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0]!.body!).model).toBe('nomic-embed-text')
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([], [])).toBe(0)
  })
  it('risposta incompleta → errore', async () => {
    fake({ '/api/embed': () => ({ embeddings: [] }) })
    await expect(embed(cfg(), ['a'])).rejects.toMatchObject({ code: 'invalid' })
  })
})
