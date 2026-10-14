import { describe, expect, it } from 'vitest'
import { checkFolder, explainFsError, isNetworkPath, pathRoot } from './fsErrors'
import { getFs, type FsApi } from './fs'

describe('percorsi', () => {
  it('radice di percorsi di rete, unità e posix', () => {
    expect(pathRoot('\\\\server\\progetti\\alfa')).toBe('\\\\server\\progetti')
    expect(pathRoot('//server/progetti/alfa')).toBe('\\\\server\\progetti')
    expect(pathRoot('z:\\Progetti\\Alfa')).toBe('Z:\\')
    expect(pathRoot('/home/u/progetti')).toBe('/')
    expect(pathRoot('relativo')).toBe('')
    expect(isNetworkPath('\\\\server\\x')).toBe(true)
    expect(isNetworkPath('Z:\\x')).toBe(false)
  })
})

describe('explainFsError', () => {
  const err = (code: number) => new Error(`failed to open path with error: something (os error ${code})`)
  it.each([
    [53, 'Il computer di rete non è raggiungibile'],
    [67, 'La cartella condivisa non esiste sul server'],
    [5, 'Accesso negato'],
    [1326, 'Credenziali di rete non valide'],
    [1219, 'Esiste già una connessione a questo server'],
    [64, 'La connessione alla cartella di rete si è interrotta'],
    [121, 'non risponde'],
    [1272, 'accesso guest'],
    [32, 'in uso da un altro programma'],
  ])('os error %i', (code, text) => {
    const msg = explainFsError(err(code))
    expect(msg).toContain(text)
    expect(msg).toContain(`codice ${code}`)
  })
  it('unità mappata non disponibile', () => {
    expect(explainFsError(err(3), 'Z:\\Progetti')).toContain('L’unità Z: non è disponibile')
    expect(explainFsError(err(3), '\\\\server\\x')).toContain('Il percorso non esiste')
  })
  it('percorso non consentito dall’app', () => {
    expect(explainFsError(new Error('forbidden path: \\\\server\\x'))).toContain('sceglilo di nuovo con «Sfoglia»')
  })
  it('errore sconosciuto: resta il messaggio originale', () => {
    expect(explainFsError(new Error('boh'))).toBe('boh')
    expect(explainFsError(err(99999))).toContain('os error 99999')
  })
})

/** Filesystem in memoria con guasti simulati. */
async function faulty(over: Partial<FsApi>): Promise<FsApi> {
  const base = await getFs()
  return { ...base, ...over }
}

describe('checkFolder', () => {
  it('cartella raggiungibile e scrivibile: nessun problema', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/ok/progetti/a.txt', 'x')
    expect(await checkFolder(fs, '/ok/progetti', { write: true })).toBeNull()
    // Non esiste ancora: si controlla la cartella che la conterrà
    expect(await checkFolder(fs, '/ok/progetti/nuova/sotto', { write: true })).toBeNull()
  })
  it('server o condivisione non raggiungibile', async () => {
    const fs = await faulty({ exists: async () => false })
    expect(await checkFolder(fs, '\\\\nas\\progetti\\alfa')).toContain('Il percorso di rete \\\\nas\\progetti non è raggiungibile')
  })
  it('unità mappata scollegata', async () => {
    const fs = await faulty({ exists: async () => false })
    expect(await checkFolder(fs, 'Z:\\Progetti')).toContain('L’unità Z: non è disponibile')
  })
  it('cartella non leggibile per permessi', async () => {
    const fs = await faulty({
      exists: async () => true,
      listDir: async () => {
        throw new Error('read dir failed: Access is denied. (os error 5)')
      },
    })
    expect(await checkFolder(fs, '\\\\nas\\progetti')).toContain('Accesso negato')
  })
  it('cartella leggibile ma non scrivibile', async () => {
    const fs = await faulty({
      exists: async () => true,
      listDir: async () => [],
      createExclusive: async () => {
        throw new Error('Access is denied. (os error 5)')
      },
    })
    const msg = await checkFolder(fs, '\\\\nas\\dati', { write: true })
    expect(msg).toContain('Nella cartella non si può scrivere')
    expect(msg).toContain('Accesso negato')
  })
  it('errore di rete durante il controllo', async () => {
    const fs = await faulty({
      exists: async () => {
        throw new Error('The network path was not found. (os error 53)')
      },
    })
    expect(await checkFolder(fs, '\\\\nas\\progetti')).toContain('Il computer di rete non è raggiungibile')
  })
})
