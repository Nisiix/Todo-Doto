/**
 * `fetch` per le API esterne: in Tauri passa dal plugin http (nessun vincolo
 * CORS, permessi dichiarati in capabilities), altrove usa quello del browser.
 */
import { isTauri } from './fs'
import type { FetchFn } from './drive'

let fetchPromise: Promise<FetchFn> | null = null

export function getHttp(): Promise<FetchFn> {
  if (!fetchPromise) {
    fetchPromise = isTauri
      ? import('@tauri-apps/plugin-http').then((m) => (input: string, init?: RequestInit) => m.fetch(input, init))
      : Promise.resolve((input: string, init?: RequestInit) => window.fetch(input, init))
  }
  return fetchPromise
}
