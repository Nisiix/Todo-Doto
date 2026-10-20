/**
 * Ogni quanto controllare la cartella condivisa. Con molti PC aperti sulla
 * stessa cartella il carico sul file server è la somma dei controlli di tutti:
 * chi ha la finestra davanti controlla spesso, chi l'ha in secondo piano o è
 * lontano dal PC molto meno. Alle novità si arriva comunque subito tornando
 * sulla finestra (refresh al focus) o grazie alle notifiche del file system.
 */
export const POLL_ACTIVE_MS = 4_000
export const POLL_BACKGROUND_MS = 30_000
export const POLL_IDLE_MS = 60_000
export const POLL_HIDDEN_MS = 120_000
/** Senza tastiera né mouse per questo tempo si è «lontani dal PC». */
export const IDLE_AFTER_MS = 5 * 60_000

export function pollInterval(s: { hidden: boolean; focused: boolean; idleMs: number }): number {
  if (s.hidden) return POLL_HIDDEN_MS
  if (s.idleMs >= IDLE_AFTER_MS) return POLL_IDLE_MS
  if (!s.focused) return POLL_BACKGROUND_MS
  return POLL_ACTIVE_MS
}
