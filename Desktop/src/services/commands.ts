/**
 * Palette dei comandi nella ricerca globale (Ctrl+K):
 *
 *   testo   → risultati della ricerca, e i comandi il cui nome corrisponde
 *   > testo → solo i comandi (tutti, se dopo > non c'è nulla)
 *   + testo → aggiunge un task al progetto aperto (con l'inserimento rapido)
 *
 * Funzioni pure: qui solo la lettura della richiesta e la scelta dei comandi.
 */
import { fold } from './quickAdd'

export type PaletteMode = 'search' | 'commands' | 'add'

export function parsePaletteQuery(query: string): { mode: PaletteMode; text: string } {
  const q = query.trimStart()
  if (q.startsWith('>')) return { mode: 'commands', text: q.slice(1).trim() }
  if (q.startsWith('+')) return { mode: 'add', text: q.slice(1).trim() }
  return { mode: 'search', text: q.trim() }
}

export interface CommandDef {
  id: string
  label: string
  /** Altre parole con cui trovarlo (sinonimi, inglese/italiano). */
  keywords?: string[]
}

/**
 * Comandi che corrispondono al testo: ogni parola deve comparire nel nome o in
 * una parola chiave (senza maiuscole né accenti); prima quelli il cui nome
 * inizia con il testo. Testo vuoto: tutti, nell'ordine dato.
 */
export function matchCommands<T extends CommandDef>(commands: T[], text: string): T[] {
  const words = text
    .split(/\s+/)
    .map(fold)
    .filter(Boolean)
  if (!words.length) return commands
  const scored: { c: T; score: number; i: number }[] = []
  commands.forEach((c, i) => {
    const label = fold(c.label)
    const hay = [label, ...(c.keywords ?? []).map(fold)]
    if (!words.every((w) => hay.some((h) => h.includes(w)))) return
    const score = label.startsWith(words.join('')) ? 0 : label.includes(words[0]!) ? 1 : 2
    scored.push({ c, score, i })
  })
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map((x) => x.c)
}
