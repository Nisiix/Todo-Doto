/**
 * Controlli dei campi dello stack prima del salvataggio.
 *
 * Indirizzi, percorsi e nomi di variabile vengono usati dallo script di
 * configurazione e dalla creazione della cartella del progetto: un valore
 * sbagliato lì si scopre solo quando la configurazione fallisce sul PC di
 * qualcun altro. Per questo si segnalano subito, accanto al campo, e lo stack
 * non si salva finché non sono corretti. La cartella del progetto si controlla
 * a parte (serve il disco: vedi `validateProjectFolder`).
 */
import { defineMessages } from '@/i18n'
import type { Stack } from '@/types'
import { normalizeUrl } from './fs'
import { applyTokens, safeRelPath, type ProjectVars } from './scaffold'

const m = defineMessages({
  it: {
    repo: 'Indirizzo del repository non valido: usa https://…, git@server:percorso oppure una cartella (es. \\\\server\\git\\progetto).',
    url: 'Indirizzo non valido: dev’essere una pagina web, es. https://…',
    cwd: 'Cartella non valida: contiene caratteri non ammessi (< > " | ? * o «:» fuori dalla lettera dell’unità).',
    envKey: 'Nome non valido: solo lettere, cifre e _, senza iniziare con una cifra (es. API_URL).',
    envDup: 'Variabile già presente nell’elenco.',
    filePath: 'Percorso non valido: dev’essere dentro la cartella del progetto (es. src/main.ts), senza unità, «..» o caratteri < > : " | ? *.',
    fileDup: 'File già presente nell’elenco.',
  },
  en: {
    repo: 'Invalid repository address: use https://…, git@server:path or a folder (e.g. \\\\server\\git\\project).',
    url: 'Invalid address: it must be a web page, e.g. https://…',
    cwd: 'Invalid folder: it contains characters that are not allowed (< > " | ? * or “:” outside the drive letter).',
    envKey: 'Invalid name: letters, digits and _ only, not starting with a digit (e.g. API_URL).',
    envDup: 'Variable already in the list.',
    filePath: 'Invalid path: it must be inside the project folder (e.g. src/main.ts), without a drive, “..” or the characters < > : " | ? *.',
    fileDup: 'File already in the list.',
  },
})

/** Chiave del campo con l'errore: `repoUrl`, `prereq:<id>:url`, `step:<id>:url`, `step:<id>:cwd`, `env:<n>:key`, `file:<id>:path`. */
export type StackErrors = Record<string, string>

/** Pagina web apribile nel browser (anche senza protocollo, es. "nodejs.org/download"). */
export function isWebUrl(value: string): boolean {
  const t = normalizeUrl(value)
  if (!/^https?:\/\//i.test(t) || /\s/.test(t)) return false
  try {
    const host = new URL(t).hostname
    return host === 'localhost' || /^[^.]+(\.[^.]+)+$/.test(host)
  } catch {
    return false
  }
}

/** Indirizzo da cui clonare: URL (https, ssh, git, file), forma git@server:percorso, cartella locale o di rete. */
export function isRepoAddress(value: string): boolean {
  const t = value.trim()
  if (/^(ssh|git|file):\/\/\S+$/i.test(t)) return true
  if (/^[\w.-]+@[\w.-]+:\S+$/.test(t)) return true
  if (/^\\\\[^\\/\s]+[\\/][^\\/]+/.test(t)) return true // \\server\condivisione
  if (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('/')) return !/[<>"|?*]/.test(t)
  return isWebUrl(t)
}

/** Cartella di lavoro di un passo: relativa o assoluta, senza caratteri vietati da Windows. */
export function isValidCwd(value: string): boolean {
  const t = value.trim().replace(/^[a-zA-Z]:/, '')
  return !/[<>"|?*:]/.test(t)
}

/** Percorso di un file iniziale: relativo, dentro la cartella del progetto, con un nome valido. */
export function fileRelPath(value: string): string | null {
  const p = safeRelPath(value)
  return p && !/[<>:"|?*]/.test(p) ? p : null
}

/**
 * Errori dei campi dello stack (vuoto se è tutto a posto). I campi vuoti non
 * sono errori: le righe senza nome si scartano al salvataggio. I segnaposto
 * {{name}} e {{slug}} si controllano già sostituiti con i valori del progetto.
 */
export function validateStackFields(stack: Stack, vars: ProjectVars): StackErrors {
  const errors: StackErrors = {}
  const t = (s: string) => applyTokens(s, vars).trim()
  if (t(stack.repoUrl) && !isRepoAddress(t(stack.repoUrl))) errors.repoUrl = m.repo
  for (const p of stack.prerequisites) {
    if (t(p.url) && !isWebUrl(t(p.url))) errors[`prereq:${p.id}:url`] = m.url
  }
  for (const s of stack.steps) {
    if (s.kind === 'link' && t(s.url) && !isWebUrl(t(s.url))) errors[`step:${s.id}:url`] = m.url
    if (s.kind === 'command' && t(s.cwd) && !isValidCwd(t(s.cwd))) errors[`step:${s.id}:cwd`] = m.cwd
  }
  const keys = new Set<string>()
  stack.envVars.forEach((v, i) => {
    const k = v.key.trim()
    if (!k) return
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) errors[`env:${i}:key`] = m.envKey
    else if (keys.has(k.toUpperCase())) errors[`env:${i}:key`] = m.envDup
    keys.add(k.toUpperCase())
  })
  const paths = new Set<string>()
  for (const f of stack.files) {
    if (!f.path.trim()) continue
    const p = fileRelPath(t(f.path))
    if (!p) errors[`file:${f.id}:path`] = m.filePath
    else if (paths.has(p.toLowerCase())) errors[`file:${f.id}:path`] = m.fileDup
    if (p) paths.add(p.toLowerCase())
  }
  return errors
}
