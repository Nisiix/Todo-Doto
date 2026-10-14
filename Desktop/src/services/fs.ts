/**
 * Accesso al filesystem.
 *
 * In Tauri usa i plugin ufficiali (fs, dialog, opener, path). Fuori da Tauri
 * (es. `npm run dev` aperto nel browser) usa un filesystem in memoria così
 * l'interfaccia si può provare senza compilare il backend.
 */
import type { Identity } from '@/types'
import { common } from '@/i18n/common'
import { locale } from '@/i18n'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface FileStat {
  mtimeMs: number
  size: number
}

export interface FsApi {
  readText(path: string): Promise<string>
  readBinary(path: string): Promise<Uint8Array>
  writeTextAtomic(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  readDir(path: string): Promise<string[]>
  remove(path: string): Promise<void>
  stat(path: string): Promise<FileStat | null>
  watchDir(path: string, onChange: () => void): Promise<() => void>
  join(...parts: string[]): Promise<string>
  appDataDir(): Promise<string>
  pickFolder(title?: string): Promise<string | null>
  pickFile(title?: string): Promise<string | null>
  /** Chiede dove salvare un file; ritorna il percorso scelto (null se annullato). */
  saveFile(defaultName: string, title?: string): Promise<string | null>
  openExternal(target: string, kind: 'file' | 'link'): Promise<void>
  identity(): Promise<Identity>
  /** Ricevitore OAuth su 127.0.0.1: apre una porta e attende il redirect. */
  oauthStart(): Promise<number>
  oauthWait(): Promise<{ code?: string; state?: string; error?: string }>
}

// ---------------------------------------------------------------------------
// Implementazione Tauri
// ---------------------------------------------------------------------------

async function tauriFs(): Promise<FsApi> {
  const fs = await import('@tauri-apps/plugin-fs')
  const dialog = await import('@tauri-apps/plugin-dialog')
  const opener = await import('@tauri-apps/plugin-opener')
  const path = await import('@tauri-apps/api/path')
  const { invoke } = await import('@tauri-apps/api/core')

  return {
    readText: (p) => fs.readTextFile(p),
    readBinary: (p) => fs.readFile(p),
    async writeTextAtomic(p, text) {
      const tmp = `${p}.${Math.random().toString(36).slice(2, 8)}.tmp`
      await fs.writeTextFile(tmp, text)
      try {
        await fs.rename(tmp, p)
      } catch (e) {
        // Alcuni share di rete rifiutano il rename sopra un file esistente:
        // ripiego su scrittura diretta.
        await fs.writeTextFile(p, text)
        await fs.remove(tmp).catch(() => {})
        if (!(e instanceof Error)) throw e
      }
    },
    exists: (p) => fs.exists(p),
    mkdir: (p) => fs.mkdir(p, { recursive: true }),
    async readDir(p) {
      const entries = await fs.readDir(p)
      return entries.filter((e) => e.isFile).map((e) => e.name)
    },
    remove: (p) => fs.remove(p),
    async stat(p) {
      try {
        const s = await fs.stat(p)
        return { mtimeMs: s.mtime ? s.mtime.getTime() : 0, size: s.size }
      } catch {
        return null
      }
    },
    async watchDir(p, onChange) {
      try {
        const unwatch = await fs.watch(p, () => onChange(), { recursive: true, delayMs: 400 })
        return unwatch
      } catch {
        // Il watcher può fallire sugli share di rete: il polling copre comunque.
        return () => {}
      }
    },
    join: (...parts) => path.join(...parts),
    appDataDir: () => path.appDataDir(),
    async pickFolder(title) {
      const r = await dialog.open({ directory: true, multiple: false, title })
      return typeof r === 'string' ? r : null
    },
    async pickFile(title) {
      const r = await dialog.open({ directory: false, multiple: false, title })
      return typeof r === 'string' ? r : null
    },
    async saveFile(defaultName, title) {
      const r = await dialog.save({ defaultPath: defaultName, title })
      return typeof r === 'string' ? r : null
    },
    async openExternal(target, kind) {
      if (kind === 'link') await opener.openUrl(target)
      else await opener.openPath(target)
    },
    identity: () => invoke<Identity>('get_identity'),
    oauthStart: () => invoke<number>('oauth_start'),
    oauthWait: () => invoke('oauth_wait', { locale }),
  }
}

// ---------------------------------------------------------------------------
// Implementazione in memoria (anteprima nel browser)
// ---------------------------------------------------------------------------

function memoryFs(): FsApi {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  const listeners = new Map<string, Set<() => void>>()
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const notify = (p: string) => {
    for (const [dir, set] of listeners) if (p.startsWith(dir)) set.forEach((cb) => cb())
  }
  return {
    async readText(p) {
      const f = files.get(norm(p))
      if (!f) throw new Error(common.fileNotFound(p))
      return f.text
    },
    async readBinary(p) {
      const f = files.get(norm(p))
      if (!f) throw new Error(common.fileNotFound(p))
      return new TextEncoder().encode(f.text)
    },
    async writeTextAtomic(p, text) {
      files.set(norm(p), { text, mtimeMs: Date.now() })
      notify(norm(p))
    },
    async exists(p) {
      const n = norm(p)
      if (files.has(n)) return true
      for (const k of files.keys()) if (k.startsWith(n + '/')) return true
      return false
    },
    async mkdir() {},
    async readDir(p) {
      const n = norm(p) + '/'
      const out: string[] = []
      for (const k of files.keys()) {
        if (k.startsWith(n) && !k.slice(n.length).includes('/')) out.push(k.slice(n.length))
      }
      return out
    },
    async remove(p) {
      files.delete(norm(p))
      notify(norm(p))
    },
    async stat(p) {
      const f = files.get(norm(p))
      return f ? { mtimeMs: f.mtimeMs, size: f.text.length } : null
    },
    async watchDir(p, cb) {
      const n = norm(p)
      if (!listeners.has(n)) listeners.set(n, new Set())
      listeners.get(n)!.add(cb)
      return () => listeners.get(n)?.delete(cb)
    },
    async join(...parts) {
      return parts.map(norm).join('/')
    },
    async appDataDir() {
      return '/appdata'
    },
    async pickFolder() {
      return '/demo/' + Math.random().toString(36).slice(2, 7)
    },
    async pickFile() {
      return '/demo/documento.pdf'
    },
    async saveFile(defaultName) {
      return '/demo/' + defaultName
    },
    async openExternal(target, kind) {
      if (kind === 'link') window.open(target, '_blank')
    },
    async identity() {
      return { username: 'anteprima', hostname: 'BROWSER' }
    },
    async oauthStart() {
      throw new Error(common.drive.desktopOnly)
    },
    async oauthWait() {
      throw new Error(common.drive.desktopOnly)
    },
  }
}

let apiPromise: Promise<FsApi> | null = null
export function getFs(): Promise<FsApi> {
  if (!apiPromise) apiPromise = isTauri ? tauriFs() : Promise.resolve(memoryFs())
  return apiPromise
}

/** Solo per i test: ricrea il filesystem in memoria vuoto. */
export function __resetMemoryFs() {
  if (!isTauri) apiPromise = Promise.resolve(memoryFs())
}
