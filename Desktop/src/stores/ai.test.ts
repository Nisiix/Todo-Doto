import { afterEach, describe, expect, it } from 'vitest'
import { useAiStore, withAi } from './ai'
import { useSessionStore } from './session'
import { loadConfig } from '@/services/config'
import type { AiFake } from '@/services/localAi'

const setFake = (f: AiFake | undefined) => Object.assign(window, { __pgmAi: f })
afterEach(() => setFake(undefined))

/** Ollama simulato con i modelli indicati (null = spento). */
function ollama(models: string[] | null) {
  let calls = 0
  setFake({
    request(req) {
      calls++
      if (!models) throw new Error('unreachable')
      const path = new URL(req.url).pathname
      if (path === '/api/tags') return { status: 200, body: JSON.stringify({ models: models.map((name) => ({ name })) }) }
      if (path === '/api/version') return { status: 200, body: '{"version":"0.12.0"}' }
      return { status: 404, body: '{}' }
    },
  })
  return () => calls
}

async function setup() {
  const session = useSessionStore()
  await session.init()
  return { session, ai: useAiStore() }
}

describe('IA locale: attivazione', () => {
  it('spenta di default; il banner resta finché non la si attiva o lo si chiude, poi mai più', async () => {
    ollama(null)
    const { ai } = await setup()
    await ai.start()
    expect(ai.config.enabled).toBe(false)
    expect(ai.showBanner).toBe(true)
    await ai.dismissBanner()
    expect(ai.showBanner).toBe(false)
    // La scelta è salvata su questo PC
    expect((await loadConfig()).ai.bannerDismissed).toBe(true)
  })

  it('al primo avvio la attiva da sola se trova il modello consigliato (es. dall’installer), una volta sola', async () => {
    ollama(['qwen3:4b', 'nomic-embed-text:latest'])
    const { ai } = await setup()
    await ai.start()
    expect(ai.config).toMatchObject({ enabled: true, autoDetectDone: true })
    expect(ai.status).toBe('ready')
    expect(ai.active).toBe(true)
    expect(ai.showBanner).toBe(false)
    // Spenta dall'utente: non si riaccende al riavvio
    await ai.save({ enabled: false })
    await ai.start()
    expect(ai.config.enabled).toBe(false)
  })

  it('Ollama senza il modello: non si attiva da sola', async () => {
    ollama(['llama3.2:1b'])
    const { ai } = await setup()
    await ai.start()
    expect(ai.config.enabled).toBe(false)
    expect(ai.config.autoDetectDone).toBe(true)
  })
})

describe('IA locale: uso dalle funzioni', () => {
  it('ensureReady: pronta solo se attiva, il motore risponde e c’è il modello', async () => {
    ollama(['qwen3:4b'])
    const { ai } = await setup()
    await ai.save({ enabled: true, autoDetectDone: true })
    expect(await ai.ensureReady()).toBe(true)
    ollama(['altro'])
    ai.markStale()
    expect(await ai.ensureReady()).toBe(false)
    expect(ai.status).toBe('no-model')
    ollama(null)
    expect(await ai.ensureReady()).toBe(false)
    expect(ai.status).toBe('offline')
  })

  it('withAi: senza IA restituisce null e non chiama il motore', async () => {
    const calls = ollama(['qwen3:4b'])
    await setup()
    expect(await withAi(async () => 'x')).toBeNull()
    expect(calls()).toBe(0)
  })

  it('withAi: un errore della richiesta non arriva a chi chiama', async () => {
    ollama(['qwen3:4b'])
    const { ai } = await setup()
    await ai.save({ enabled: true })
    expect(await withAi(async () => 42)).toBe(42)
    expect(
      await withAi(async () => {
        throw new Error('boom')
      }),
    ).toBeNull()
  })
})
