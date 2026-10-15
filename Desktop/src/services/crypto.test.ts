import { describe, expect, it } from 'vitest'
import { decryptLocal, encryptLocal, hashPassword, verifyPassword } from './crypto'

describe('crypto: password del workspace', () => {
  it('verifica la password corretta e rifiuta quella sbagliata', async () => {
    const stored = await hashPassword('segreto1')
    expect(stored.salt).not.toBe('')
    expect(stored.iterations).toBeGreaterThan(100_000)
    expect(await verifyPassword('segreto1', stored)).toBe(true)
    expect(await verifyPassword('Segreto1', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('produce hash diversi per la stessa password (salt casuale)', async () => {
    const a = await hashPassword('x')
    const b = await hashPassword('x')
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('crypto: password memorizzata in locale', () => {
  it('cifra e decifra con lo stesso segreto', async () => {
    const payload = await encryptLocal('la-mia-password', 'mrossi@PC-MARIO')
    expect(payload).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/)
    expect(await decryptLocal(payload, 'mrossi@PC-MARIO')).toBe('la-mia-password')
  })

  it('non decifra con un segreto diverso o un payload corrotto', async () => {
    const payload = await encryptLocal('pw', 'a@B')
    expect(await decryptLocal(payload, 'altro@PC')).toBeNull()
    expect(await decryptLocal('non-valido', 'a@B')).toBeNull()
  })
})
