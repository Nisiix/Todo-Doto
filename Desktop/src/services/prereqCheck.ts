/**
 * Verifica automatica dei prerequisiti (Stack › Configura sul tuo PC).
 *
 * Per ogni prerequisito si sceglie come verificarlo (comando dello stack,
 * comando del catalogo, controllo dedicato per gli strumenti senza comando),
 * si esegue il comando nell'app desktop e se ne interpreta l'esito:
 * installato (con la versione), da aggiornare, versione diversa da quella
 * indicata, non trovato, verifica non riuscita, nessuna risposta in tempo,
 * non necessario su questo sistema, verifica solo manuale.
 *
 * I comandi scritti nello stack arrivano da un file condiviso: partono da soli
 * solo se sono semplici richieste di versione (`node -v`, `git --version`…);
 * gli altri richiedono una conferma esplicita di chi li esegue.
 */
import type { Prerequisite } from '@/types'
import type { CheckOutput } from './fs'
import { lookupPrerequisite } from './prerequisites'

export type OsName = 'windows' | 'macos' | 'linux'

export type CheckStatus =
  /** Installato e conforme alla versione richiesta (o nessuna versione richiesta). */
  | 'ok'
  /** Installato, ma la versione non si legge dall'output: va confrontata a mano. */
  | 'installed'
  /** Installato con una versione più vecchia di quella richiesta. */
  | 'outdated'
  /** Installato con una versione diversa (più recente) di quella indicata esattamente. */
  | 'different'
  /** Non installato o non raggiungibile dal PATH. */
  | 'missing'
  /** Il comando ha risposto con un errore che non dice se lo strumento c'è. */
  | 'failed'
  /** Il comando non ha risposto entro il tempo massimo. */
  | 'timeout'
  /** Nessun modo automatico di verificarlo: lo si spunta a mano. */
  | 'manual'
  /** Non serve su questo sistema operativo (es. Xcode su Windows). */
  | 'otherOs'
  /** Comando personalizzato non banale: parte solo dopo una conferma. */
  | 'confirm'
  /** Anteprima nel browser: i comandi si eseguono solo nell'app desktop. */
  | 'unavailable'

export interface CheckPlan {
  /** Comando da eseguire ('' se non c'è modo di verificarlo). */
  command: string
  /** Comando del catalogo o controllo dedicato: si esegue senza chiedere. */
  trusted: boolean
  /** Controllo dedicato: uscita diversa da 0 o output vuoto = non installato. */
  probe: boolean
  /** Come leggere la versione nell'output (altrimenti il primo numero di versione). */
  version?: RegExp
  /** Sistemi su cui serve (vuoto = tutti). */
  os: OsName[]
}

export interface CheckResult {
  status: CheckStatus
  /** Versione trovata ('' se non rilevata). */
  version: string
  /** Comando eseguito. */
  command: string
  /** Output del comando (per i dettagli in caso di problemi). */
  output: string
}

/** Sistema operativo corrente, dallo user agent (vale anche nella WebView di Tauri). */
export function currentOs(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): OsName {
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos'
  return 'linux'
}

// --- sicurezza dei comandi personalizzati ---------------------------------------------

/** Comandi della shell o di sistema che non partono mai da soli, qualunque sia l'argomento. */
const DENY = new Set(
  'del erase rd rmdir rm format shutdown mv move ren rename copy xcopy robocopy reg sc net taskkill cipher diskpart bcdedit powershell pwsh cmd start call set setx mklink attrib icacls takeown curl wget bitsadmin certutil mshta rundll32 regsvr32 wscript cscript sudo chmod chown dd kill killall'.split(' '),
)
const VERSION_ARGS = /^(?:-{1,2}(?:v|V|version|ver)|version|-\?|\/\?|--help|-h)$/

/**
 * Un comando è "sicuro" se è una semplice richiesta di versione: un solo
 * eseguibile (nome, senza percorso) seguito solo da argomenti come -v,
 * --version, version, -? e nient'altro (niente pipe, redirezioni, variabili…).
 */
export function isSafeCheck(command: string): boolean {
  const parts = command.trim().split(/\s+/)
  const [exe, ...args] = parts
  if (!exe || !args.length) return false
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/.test(exe)) return false
  if (DENY.has(exe.toLowerCase().replace(/\.(exe|cmd|bat|com)$/, ''))) return false
  return args.every((a) => VERSION_ARGS.test(a))
}

/** Come verificare un prerequisito: il comando dello stack, altrimenti quello del catalogo o il controllo dedicato. */
export function planCheck(p: Pick<Prerequisite, 'name' | 'check'>, os: OsName): CheckPlan {
  const known = lookupPrerequisite(p.name)
  const own = p.check.trim()
  const base = { os: known?.os ?? [], probe: false }
  if (own) return { ...base, command: own, trusted: own === known?.check || isSafeCheck(own) }
  if (known?.check) return { ...base, command: known.check, trusted: true }
  if (known?.probe && os === 'windows') return { ...base, command: known.probe.command, trusted: true, probe: true, version: known.probe.version }
  return { ...base, command: '', trusted: true }
}

// --- versioni -------------------------------------------------------------------------

/** Prima versione che compare nel testo (es. "v20.11.0" → "20.11.0", "Python 3.12.1" → "3.12.1"). */
export function parseVersion(text: string, pattern?: RegExp): string {
  if (pattern) {
    const m = pattern.exec(text)
    if (m) return (m[1] ?? m[0]).trim()
  }
  const dotted = /(?:^|[^\d.])v?(\d+\.\d+(?:\.\d+)?)/.exec(text)
  if (dotted) return dotted[1]!
  const single = /(?:^|[^\w.])(\d{1,4})(?![\w.])/.exec(text)
  return single ? single[1]! : ''
}

const nums = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0)

/** Confronta due versioni sui primi `len` componenti (tutti se assente): -1, 0, 1. */
export function compareVersions(a: string, b: string, len?: number): number {
  const x = nums(a)
  const y = nums(b)
  const n = len ?? Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

export type Requirement =
  | { kind: 'any' }
  | { kind: 'min'; v: string }
  | { kind: 'max'; v: string; inclusive: boolean }
  | { kind: 'range'; min: string; max: string }
  /** Versione indicata senza operatori: devono coincidere i componenti scritti (es. "3.11" ⇒ 3.11.x). */
  | { kind: 'exact'; v: string }
  /** ^X.Y: stessa versione principale, almeno X.Y. */
  | { kind: 'caret'; v: string }
  /** ~X.Y: stessa X.Y, almeno X.Y.Z. */
  | { kind: 'tilde'; v: string }

const VER = String.raw`v?(\d+(?:\.\d+)*)`

/**
 * Interpreta la versione richiesta scritta nello stack: "20+", ">= 3.11",
 * "3.11 o superiore", "^18.2", "~1.4", "<= 2", "16 - 20", "20.x", "2022 (…)",
 * "8"; "stable", "latest", "LTS" o testo senza numeri ⇒ qualsiasi versione.
 */
export function parseRequirement(spec: string): Requirement {
  const s = spec.trim().toLowerCase()
  if (!s || !/\d/.test(s)) return { kind: 'any' }
  let m = new RegExp(String.raw`^${VER}\s*(?:-|–|—|\.\.|to|a)\s*${VER}`).exec(s)
  if (m) return { kind: 'range', min: m[1]!, max: m[2]! }
  m = new RegExp(String.raw`^(?:>=|≥|=>)\s*${VER}`).exec(s)
  if (m) return { kind: 'min', v: m[1]! }
  m = new RegExp(String.raw`^>\s*${VER}`).exec(s)
  if (m) return { kind: 'min', v: m[1]! }
  m = new RegExp(String.raw`^(<=|≤|<)\s*${VER}`).exec(s)
  if (m) return { kind: 'max', v: m[2]!, inclusive: m[1] !== '<' }
  m = new RegExp(String.raw`^\^\s*${VER}`).exec(s)
  if (m) return { kind: 'caret', v: m[1]! }
  m = new RegExp(String.raw`^~\s*${VER}`).exec(s)
  if (m) return { kind: 'tilde', v: m[1]! }
  m = new RegExp(String.raw`^${VER}(?:\.[x*])*\s*(\+|or (?:higher|later|newer|above)|o (?:superiore|successiv[ae]|più recente)|and (?:up|above|later)|e successiv[ae]|min(?:imum|imo)?)?`).exec(s)
  if (m) return m[2] ? { kind: 'min', v: m[1]! } : { kind: 'exact', v: m[1]! }
  return { kind: 'any' }
}

/** La versione installata rispetta quella richiesta? ok, outdated (più vecchia), different (diversa/più recente). */
export function matchVersion(installed: string, spec: string): 'ok' | 'outdated' | 'different' {
  const r = parseRequirement(spec)
  switch (r.kind) {
    case 'any':
      return 'ok'
    case 'min':
      return compareVersions(installed, r.v) >= 0 ? 'ok' : 'outdated'
    case 'max': {
      const c = compareVersions(installed, r.v, nums(r.v).length)
      return c < 0 || (r.inclusive && c === 0) ? 'ok' : 'different'
    }
    case 'range':
      if (compareVersions(installed, r.min) < 0) return 'outdated'
      return compareVersions(installed, r.max, nums(r.max).length) <= 0 ? 'ok' : 'different'
    case 'exact': {
      const c = compareVersions(installed, r.v, nums(r.v).length)
      return c === 0 ? 'ok' : c < 0 ? 'outdated' : 'different'
    }
    case 'caret':
      if (compareVersions(installed, r.v) < 0) return 'outdated'
      return compareVersions(installed, r.v, 1) === 0 ? 'ok' : 'different'
    case 'tilde':
      if (compareVersions(installed, r.v) < 0) return 'outdated'
      return compareVersions(installed, r.v, Math.min(2, nums(r.v).length)) === 0 ? 'ok' : 'different'
  }
}

// --- esito di un comando ------------------------------------------------------------

/** Messaggi con cui shell e sistema dicono che il comando non esiste (anche in italiano). */
const NOT_FOUND =
  /is not recognized as an internal or external command|non è riconosciuto come comando interno o esterno|command not found|not found|cannot find the path|cannot find the file|impossibile trovare il percorso|impossibile trovare il file|no such file or directory|was not found; run without arguments to install from the microsoft store/i

/** Interpreta l'esito di un comando di verifica rispetto alla versione richiesta. */
export function interpretCheck(run: CheckOutput, plan: CheckPlan, required: string): CheckResult {
  const output = [run.stdout, run.stderr].map((x) => x.trim()).filter(Boolean).join('\n')
  const base = { command: plan.command, output, version: '' }
  if (run.spawnError) return { ...base, status: 'failed', output: run.spawnError }
  if (run.timedOut) return { ...base, status: 'timeout' }
  const code = run.code ?? -1
  // 9009: "comando non riconosciuto" del prompt dei comandi; 127: lo stesso per sh
  if (code === 9009 || code === 127) return { ...base, status: 'missing' }
  if (plan.probe && (code !== 0 || !run.stdout.trim())) return { ...base, status: 'missing' }
  const version = parseVersion(run.stdout, plan.version) || parseVersion(run.stderr, plan.version)
  if (code !== 0 && NOT_FOUND.test(output) && !version) return { ...base, status: 'missing' }
  if (code !== 0 && !version) return { ...base, status: 'failed' }
  // Alcuni strumenti escono con un codice diverso da 0 anche quando stampano la versione
  if (!version) return { ...base, status: parseRequirement(required).kind === 'any' ? 'ok' : 'installed' }
  return { ...base, version, status: matchVersion(version, required) }
}

/** Esito senza eseguire nulla, quando il comando non va o non si può eseguire. */
export function precheck(plan: CheckPlan, os: OsName, opts: { desktop: boolean; confirmed: boolean }): CheckResult | null {
  const base = { command: plan.command, output: '', version: '' }
  if (plan.os.length && !plan.os.includes(os)) return { ...base, status: 'otherOs' }
  if (!plan.command) return { ...base, status: 'manual' }
  if (!opts.desktop) return { ...base, status: 'unavailable' }
  if (!plan.trusted && !opts.confirmed) return { ...base, status: 'confirm' }
  return null
}

/** Esiti certi e positivi: contano come "fatto" nella procedura guidata. */
export const isSatisfied = (s: CheckStatus | undefined) => s === 'ok' || s === 'otherOs'
/** Esiti certi e negativi: va installato o aggiornato qualcosa. */
export const needsAction = (s: CheckStatus | undefined) => s === 'missing' || s === 'outdated'
/**
 * Esiti incerti: non si sa se il prerequisito va bene (versione non letta o
 * diversa, errore, nessuna risposta, comando da confermare, verifica manuale,
 * verifica non ancora fatta). Vanno segnalati e confermati a mano.
 */
export const isUncertain = (s: CheckStatus | undefined) => !isSatisfied(s) && !needsAction(s)

/**
 * Il prerequisito impedisce la configurazione automatica tramite script?
 * Sì se manca o è da aggiornare; se l'esito è incerto, finché l'utente non
 * conferma a mano (spunta) che è installato e va bene.
 */
export const blocksAutoSetup = (s: CheckStatus | undefined, confirmedByUser: boolean) => needsAction(s) || (isUncertain(s) && !confirmedByUser)
