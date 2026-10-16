import { afterEach, describe, expect, it } from 'vitest'
import { installOllama, ollamaInfo, parseInstallLine, type InstallEvent, type OllamaFake } from './ollamaSetup'

const setFake = (f: OllamaFake | undefined) => Object.assign(window, { __pgmOllama: f })
afterEach(() => setFake(undefined))

describe('installazione di Ollama', () => {
  it('legge le righe dello script e ignora le altre', () => {
    expect(parseInstallLine('##step download')).toEqual({ type: 'step', step: 'download' })
    expect(parseInstallLine('##progress 1048576 1000000000\r')).toEqual({ type: 'progress', done: 1048576, total: 1000000000 })
    expect(parseInstallLine('##ready')).toEqual({ type: 'ready' })
    expect(parseInstallLine("##error Firma dell'installer di Ollama non valida")).toEqual({ type: 'error', message: "Firma dell'installer di Ollama non valida" })
    expect(parseInstallLine('Ollama: installazione...')).toBeNull()
    expect(parseInstallLine('##step sconosciuto')).toBeNull()
  })

  it('nel browser senza simulazione non si sa se Ollama c’è', async () => {
    expect(await ollamaInfo()).toEqual({ installed: null, canInstall: false })
    await expect(installOllama(() => {})).rejects.toThrow('unsupported')
  })

  it('riporta passi e avanzamento; un errore dello script diventa il messaggio', async () => {
    const events: InstallEvent[] = []
    setFake({ info: () => ({ installed: false }), start: () => {}, install: () => ({ lines: ['##step download', '##progress 5 10', '##step install', '##ready'], code: 0 }) })
    await installOllama((e) => events.push(e))
    expect(events.map((e) => e.type)).toEqual(['step', 'progress', 'step', 'ready'])
    expect(await ollamaInfo()).toEqual({ installed: false, canInstall: true })

    setFake({ info: () => ({ installed: false }), start: () => {}, install: () => ({ lines: ['##step verify', '##error Firma non valida'], code: 1 }) })
    await expect(installOllama(() => {})).rejects.toThrow('Firma non valida')
  })

  it('si interrompe con «Annulla»', async () => {
    setFake({ info: () => ({ installed: false }), start: () => {}, install: () => ({ lines: ['##step download', '##progress 1 10', '##progress 2 10'], code: 0 }) })
    const ctl = new AbortController()
    await expect(installOllama((e) => e.type === 'progress' && ctl.abort(), ctl.signal)).rejects.toThrow('cancelled')
  })
})
