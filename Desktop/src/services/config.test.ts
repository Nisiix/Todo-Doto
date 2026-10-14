import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFs } from './fs'
import { encryptLocal } from './crypto'
import { forgetPassword, hasRememberedPassword, recallPassword, rememberPassword } from './config'

/**
 * Password ricordate: su Windows passano da DPAPI (qui simulato: il backend
 * Rust non c'è), altrove da AES-GCM locale; le voci vecchie migrano a DPAPI.
 */
const SECRET = 'mario@PC-01'
const fakeDpapi = (bytes: Uint8Array) => new Uint8Array([0xd0, ...[...bytes].reverse()])
const fakeUndpapi = (data: Uint8Array) => (data[0] === 0xd0 ? new TextDecoder().decode(new Uint8Array([...data.slice(1)].reverse())) : null)

async function credentials() {
  const fs = await getFs()
  return JSON.parse(await fs.readText(await fs.join(await fs.appDataDir(), 'credentials.json'))) as { entries: Record<string, string> }
}
async function withDpapi() {
  const fs = await getFs()
  vi.spyOn(fs, 'protectSecret').mockImplementation(async (plain) => fakeDpapi(new TextEncoder().encode(plain)))
  vi.spyOn(fs, 'unprotectSecret').mockImplementation(async (data) => fakeUndpapi(data))
}

afterEach(() => vi.restoreAllMocks())

describe('password ricordate su questo PC', () => {
  it('con DPAPI disponibile: salvata con prefisso dpapi:, mai in chiaro, e riletta', async () => {
    await withDpapi()
    await rememberPassword('ws_a', 'segreto1', SECRET)
    const entry = (await credentials()).entries.ws_a!
    expect(entry.startsWith('dpapi:')).toBe(true)
    expect(entry).not.toContain('segreto1')
    expect(await recallPassword('ws_a', SECRET)).toBe('segreto1')
    expect(await hasRememberedPassword('ws_a')).toBe(true)
  })

  it('senza DPAPI (altri sistemi, anteprima): ripiega su AES-GCM locale', async () => {
    await rememberPassword('ws_b', 'segreto2', SECRET)
    const entry = (await credentials()).entries.ws_b!
    expect(entry.startsWith('dpapi:')).toBe(false)
    expect(entry).not.toContain('segreto2')
    expect(await recallPassword('ws_b', SECRET)).toBe('segreto2')
    expect(await recallPassword('ws_b', 'altro@PC')).toBeNull() // chiave di un altro utente
  })

  it('una voce del vecchio formato viene convertita a DPAPI alla prima lettura', async () => {
    await rememberPassword('ws_c', 'x', SECRET) // crea il file
    const fs = await getFs()
    const file = await fs.join(await fs.appDataDir(), 'credentials.json')
    const creds = await credentials()
    creds.entries.ws_c = await encryptLocal('vecchia', SECRET)
    await fs.writeTextAtomic(file, JSON.stringify(creds))

    await withDpapi()
    expect(await recallPassword('ws_c', SECRET)).toBe('vecchia')
    expect((await credentials()).entries.ws_c!.startsWith('dpapi:')).toBe(true)
    expect(await recallPassword('ws_c', SECRET)).toBe('vecchia')
  })

  it('un dato DPAPI di un altro utente o PC non si decifra; "dimentica" lo rimuove', async () => {
    await withDpapi()
    await rememberPassword('ws_d', 'segreto4', SECRET)
    vi.spyOn(await getFs(), 'unprotectSecret').mockResolvedValue(null)
    expect(await recallPassword('ws_d', SECRET)).toBeNull()
    await forgetPassword('ws_d')
    expect(await hasRememberedPassword('ws_d')).toBe(false)
  })
})
