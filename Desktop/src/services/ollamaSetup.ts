/**
 * Ollama su questo PC: c'è? Si avvia e, se manca, si installa (Windows). Nel
 * backend (ollama.rs) l'installazione esegue lo stesso script dell'opzione
 * dell'installer: scarica l'installer ufficiale da ollama.com e lo avvia solo
 * se è firmato da Ollama. I modelli si scaricano poi con `pullModel`.
 *
 * Nell'anteprima nel browser e nei test si simula con `window.__pgmOllama`;
 * senza simulazione non si sa se Ollama c'è (`installed: null`).
 */
import { isTauri } from './fs'

export interface OllamaInfo {
  /** null = non si può sapere (anteprima nel browser). */
  installed: boolean | null
  canInstall: boolean
}

export type InstallStep = 'check' | 'download' | 'verify' | 'install' | 'start'

export type InstallEvent = { type: 'step'; step: InstallStep } | { type: 'progress'; done: number; total: number } | { type: 'ready' } | { type: 'error'; message: string }

/** Esito dell'installazione: 'cancelled' se interrotta, altrimenti il messaggio d'errore. */
export class OllamaInstallError extends Error {}

/** Simulazione per anteprima e test. */
export interface OllamaFake {
  info(): { installed: boolean; canInstall?: boolean }
  start(): void | Promise<void>
  /** Righe dello script e codice d'uscita. */
  install(): { lines: string[]; code: number } | Promise<{ lines: string[]; code: number }>
}
const fake = (): OllamaFake | undefined => (typeof window !== 'undefined' ? (window as unknown as { __pgmOllama?: OllamaFake }).__pgmOllama : undefined)

const STEPS: InstallStep[] = ['check', 'download', 'verify', 'install', 'start']

/** Interpreta una riga dello script (`##step …`, `##progress a b`, `##ready`, `##error …`); null per le altre. */
export function parseInstallLine(line: string): InstallEvent | null {
  const t = line.trim()
  const step = /^##step (\w+)$/.exec(t)
  if (step) return STEPS.includes(step[1] as InstallStep) ? { type: 'step', step: step[1] as InstallStep } : null
  const progress = /^##progress (\d+) (\d+)$/.exec(t)
  if (progress) return { type: 'progress', done: Number(progress[1]), total: Number(progress[2]) }
  if (t === '##ready') return { type: 'ready' }
  const error = /^##error (.*)$/.exec(t)
  if (error) return { type: 'error', message: error[1]!.trim() }
  return null
}

export async function ollamaInfo(): Promise<OllamaInfo> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    const r = await invoke<{ installed: boolean; canInstall: boolean }>('ollama_info')
    return { installed: r.installed, canInstall: r.canInstall }
  }
  const f = fake()
  if (f) {
    const r = f.info()
    return { installed: r.installed, canInstall: r.canInstall ?? true }
  }
  return { installed: null, canInstall: false }
}

/** Avvia il server di Ollama (già installato). */
export async function startOllama(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('ollama_start')
  }
  await fake()?.start()
}

/**
 * Installa e avvia Ollama. `onEvent` riceve i passi e l'avanzamento del
 * download; `signal` interrompe. Errore `OllamaInstallError` se non riesce.
 */
export async function installOllama(onEvent: (e: InstallEvent) => void, signal?: AbortSignal): Promise<void> {
  let lastError = ''
  const onLine = (line: string) => {
    const e = parseInstallLine(line)
    if (!e) return
    if (e.type === 'error') lastError = e.message
    onEvent(e)
  }
  if (signal?.aborted) throw new OllamaInstallError('cancelled')
  let code: number
  if (isTauri) {
    const { invoke, Channel } = await import('@tauri-apps/api/core')
    const channel = new Channel<string>()
    channel.onmessage = onLine
    const stop = () => void invoke('ollama_install_cancel')
    signal?.addEventListener('abort', stop, { once: true })
    try {
      code = await invoke<number>('ollama_install', { onLine: channel })
    } catch (e) {
      throw new OllamaInstallError(String(e) === 'cancelled' || signal?.aborted ? 'cancelled' : String(e))
    } finally {
      signal?.removeEventListener('abort', stop)
    }
  } else {
    const f = fake()
    if (!f) throw new OllamaInstallError('unsupported')
    const r = await f.install()
    for (const l of r.lines) {
      if (signal?.aborted) throw new OllamaInstallError('cancelled')
      onLine(l)
      await new Promise((res) => setTimeout(res, 0))
    }
    code = r.code
  }
  if (code !== 0) throw new OllamaInstallError(lastError || `exit ${code}`)
}
