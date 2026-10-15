/**
 * Aggiornamenti automatici (plugin updater di Tauri). Fuori da Tauri non fa
 * nulla. L'endpoint e la chiave pubblica sono in src-tauri/tauri.conf.json.
 */
import { isTauri } from './fs'

export interface AvailableUpdate {
  version: string
  /** YYYY-MM-DD della pubblicazione, se nota. */
  date: string | null
  notes: string
  /** Scarica e installa, riportando l'avanzamento 0..1; poi riavvia l'app. */
  install: (onProgress?: (fraction: number) => void) => Promise<void>
}

export type CheckResult = { status: 'none' } | { status: 'available'; update: AvailableUpdate } | { status: 'error'; message: string }

export async function checkForUpdate(): Promise<CheckResult> {
  if (!isTauri) return { status: 'none' }
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const { relaunch } = await import('@tauri-apps/plugin-process')
    const update = await check({ timeout: 15_000 })
    if (!update) return { status: 'none' }
    return {
      status: 'available',
      update: {
        version: update.version,
        date: update.date ? update.date.slice(0, 10) : null,
        notes: update.body ?? '',
        async install(onProgress) {
          let total = 0
          let done = 0
          await update.downloadAndInstall((e) => {
            if (e.event === 'Started') total = e.data.contentLength ?? 0
            else if (e.event === 'Progress') {
              done += e.data.chunkLength
              if (total > 0) onProgress?.(Math.min(1, done / total))
            } else if (e.event === 'Finished') onProgress?.(1)
          })
          await relaunch()
        },
      },
    }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}
