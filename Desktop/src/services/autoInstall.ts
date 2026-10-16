/**
 * Installazione automatica dei prerequisiti mancanti (Windows) con winget, la
 * Gestione pacchetti di Windows: per i prerequisiti noti si sa quale pacchetto
 * installare (scelto in base alla versione richiesta); per gli altri lo può
 * cercare l'IA locale, e il pacchetto proposto si accetta solo se winget lo
 * conosce davvero. Si eseguono solo installazioni di pacchetti winget, mai
 * comandi proposti dall'IA.
 *
 * L'installazione gira in una finestra del prompt dei comandi (si vede cosa
 * succede, Windows chiede le autorizzazioni dove servono); tornando nell'app
 * le verifiche ripartono da sole.
 */
import { z } from 'zod'
import { defineMessages, locale } from '@/i18n'
import type { AiConfig, Prerequisite } from '@/types'
import { chatJson } from './localAi'
import { lookupPrerequisite } from './prerequisites'

export interface InstallPlan {
  /** Nome del prerequisito, come nello stack. */
  name: string
  /** Pacchetto winget. */
  id: string
  /** Opzioni per l'installer del pacchetto (es. i carichi di lavoro di Visual Studio). */
  override?: string
  /** Da dove viene: il catalogo dell'app o l'IA locale. */
  source: 'catalog' | 'ai'
}

const major = (v: string) => {
  const n = Number.parseInt(/\d+/.exec(v)?.[0] ?? '', 10)
  return Number.isFinite(n) ? n : null
}
/** Versione minima richiesta ("3.11+", ">=3.11", "3.11") come [maggiore, minore]. */
const minVersion = (v: string): [number, number] | null => {
  const m = /(\d+)(?:\.(\d+))?/.exec(v)
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null
}

/** Pacchetto winget per i prerequisiti noti, scelto in base alla versione richiesta (null se non si installa così). */
const CATALOG: Record<string, (version: string) => Omit<InstallPlan, 'name' | 'source'> | null> = {
  'Node.js': (v) => ((major(v) ?? 0) > 22 ? { id: 'OpenJS.NodeJS' } : { id: 'OpenJS.NodeJS.LTS' }),
  Git: () => ({ id: 'Git.Git' }),
  Rust: () => ({ id: 'Rustlang.Rustup' }),
  'Visual Studio Build Tools': () => ({ id: 'Microsoft.VisualStudio.2022.BuildTools', override: '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' }),
  '.NET SDK': (v) => {
    const n = major(v) ?? 8
    return n >= 8 && n <= 9 ? { id: `Microsoft.DotNet.SDK.${n}` } : n > 9 ? null : { id: 'Microsoft.DotNet.SDK.8' }
  },
  // Per "2010+" va bene Visual Studio 2022 Community, che apre anche i progetti delle versioni
  // precedenti; una versione esatta più vecchia (es. "2010", senza +) si installa a mano
  'Visual Studio': (v) => {
    const year = major(v)
    if (year && (year > 2022 || (year < 2022 && !v.includes('+')))) return null
    return { id: 'Microsoft.VisualStudio.2022.Community', override: '--wait --passive --add Microsoft.VisualStudio.Workload.ManagedDesktop --includeRecommended' }
  },
  '.NET Framework': () => ({ id: 'Microsoft.DotNet.Framework.DeveloperPack_4' }),
  CMake: () => ({ id: 'Kitware.CMake' }),
  'WebView2 Runtime': () => ({ id: 'Microsoft.EdgeWebView2Runtime' }),
  'GCC (MinGW-w64)': () => ({ id: 'BrechtSanders.WinLibs.POSIX.UCRT' }),
  Python: (v) => {
    const mv = minVersion(v)
    return mv && mv[0] === 3 && mv[1] > 12 ? { id: `Python.Python.3.${Math.min(mv[1], 13)}` } : { id: 'Python.Python.3.12' }
  },
  'Java JDK': (v) => {
    const n = major(v) ?? 21
    return n <= 17 ? { id: 'EclipseAdoptium.Temurin.17.JDK' } : { id: 'EclipseAdoptium.Temurin.21.JDK' }
  },
  Go: () => ({ id: 'GoLang.Go' }),
  PHP: () => ({ id: 'PHP.PHP.8.3' }),
  Ruby: () => ({ id: 'RubyInstallerTeam.Ruby.3.3' }),
  'Android Studio': () => ({ id: 'Google.AndroidStudio' }),
  'Docker Desktop': () => ({ id: 'Docker.DockerDesktop' }),
  PostgreSQL: () => ({ id: 'PostgreSQL.PostgreSQL.16' }),
  MySQL: () => ({ id: 'Oracle.MySQL' }),
  'SQL Server': () => ({ id: 'Microsoft.SQLServer.2022.Developer' }),
  pnpm: () => ({ id: 'pnpm.pnpm' }),
  Yarn: () => ({ id: 'Yarn.Yarn' }),
}

/** Come installare in automatico un prerequisito (Windows), se l'app lo sa. */
export function catalogPlan(p: Pick<Prerequisite, 'name' | 'version'>): InstallPlan | null {
  const name = lookupPrerequisite(p.name)?.name ?? p.name
  const plan = CATALOG[name]?.(p.version)
  return plan ? { name: p.name, ...plan, source: 'catalog' } : null
}

/** Identificativo winget plausibile (lettere, cifre, punti, trattini): niente spazi né altri comandi. */
export const isWingetId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$/.test(id) && id.includes('.')

/** Output di `winget show`: il pacchetto esiste? */
export const wingetShowFound = (output: string) => /^\s*(Version|Versione|Versión|Version de|Versão)\s*:/im.test(output)

export const wingetShowCommand = (id: string) => `winget show --id ${id} -e --source winget --disable-interactivity --accept-source-agreements`

const S = defineMessages({
  it: {
    title: (p: string) => `Todo Doto - installazione dei programmi per ${p}`,
    lead: 'Todo Doto installa con winget (Gestione pacchetti di Windows) i programmi che mancano su questo PC. Se Windows chiede l\'autorizzazione, confermala.',
    licences: 'Installando, accetti le licenze dei programmi (mostrate da winget).',
    noWinget: 'winget non e\' disponibile su questo PC: installa "Programma di installazione app" dal Microsoft Store, poi riprova.',
    step: (n: string, id: string) => `Installo ${n} (${id})...`,
    ok: (n: string) => `${n}: installato.`,
    fail: (n: string) => `${n}: installazione non riuscita (codice %ERRORLEVEL%).`,
    done: 'Finito. Torna su Todo Doto: le verifiche ripartono da sole.',
  },
  en: {
    title: (p: string) => `Todo Doto - installing the programs for ${p}`,
    lead: 'Todo Doto installs the programs missing on this PC with winget (Windows Package Manager). If Windows asks for permission, confirm it.',
    licences: 'By installing you accept the program licenses (shown by winget).',
    noWinget: 'winget is not available on this PC: install "App Installer" from the Microsoft Store, then try again.',
    step: (n: string, id: string) => `Installing ${n} (${id})...`,
    ok: (n: string) => `${n}: installed.`,
    fail: (n: string) => `${n}: installation failed (code %ERRORLEVEL%).`,
    done: 'Done. Go back to Todo Doto: the checks start again by themselves.',
  },
})

/** Testo sicuro per `echo` nel prompt dei comandi. */
// (anche le parentesi: dentro i blocchi if (...) else (...) chiuderebbero il blocco)
const echo = (s: string) => `echo ${s.replace(/[&|<>^%()]/g, (c) => (c === '%' ? '%%' : `^${c}`))}`
const echoKeepErrorlevel = (s: string) => `echo ${s.replace(/[&|<>^()]/g, (c) => `^${c}`)}`

/** Script .cmd che installa i pacchetti uno dopo l'altro (si ferma solo alla fine, per lasciare leggere). */
export function installScript(projectName: string, plans: InstallPlan[]): string {
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    `title ${S.title(projectName).replace(/[&|<>^%]/g, '')}`,
    echo(S.lead),
    echo(S.licences),
    'echo.',
    'where winget >nul 2>nul',
    'if errorlevel 1 (',
    `  ${echo(S.noWinget)}`,
    '  pause',
    '  exit /b 1',
    ')',
  ]
  for (const p of plans) {
    if (!isWingetId(p.id)) continue
    const override = p.override ? ` --override "${p.override.replace(/"/g, '')}"` : ''
    lines.push(
      'echo.',
      echo(S.step(p.name, p.id)),
      `winget install --id ${p.id} -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity${override}`,
      // winget esce con codici negativi (es. -1978335212): «if errorlevel 1» non li vedrebbe
      `if %ERRORLEVEL% NEQ 0 (${echoKeepErrorlevel(S.fail(p.name))}) else (${echo(S.ok(p.name))})`,
    )
  }
  lines.push('echo.', echo(S.done), 'pause', '')
  return lines.join('\r\n')
}

const AiPlan = z.object({ wingetId: z.string().max(100), confidence: z.enum(['high', 'medium', 'low']) })

/**
 * L'IA locale propone il pacchetto winget di un prerequisito che l'app non
 * conosce. `verify` controlla con `winget show` che esista: solo allora il
 * piano vale. Null se l'IA non lo sa o il pacchetto non esiste.
 */
export async function aiInstallPlan(cfg: AiConfig, p: Pick<Prerequisite, 'name' | 'version'>, verify: (id: string) => Promise<boolean>): Promise<InstallPlan | null> {
  const r = await chatJson(cfg, {
    system:
      'You map a software prerequisite to its official package in winget (Windows Package Manager, source "winget"). ' +
      'Answer only with the exact package identifier (e.g. "Git.Git", "OpenJS.NodeJS.LTS", "Microsoft.DotNet.SDK.8") that installs that program in a version compatible with the required one. ' +
      'If you are not sure the package exists, or the program is not distributed through winget, answer with an empty wingetId and confidence "low".',
    user: `Program: ${p.name}\nRequired version: ${p.version || 'any'}\nLanguage of the user: ${locale}`,
    schema: { type: 'object', properties: { wingetId: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['wingetId', 'confidence'] },
    validate: AiPlan,
    timeoutMs: 120_000,
  })
  const id = r.wingetId.trim()
  if (!id || r.confidence === 'low' || !isWingetId(id)) return null
  return (await verify(id)) ? { name: p.name, id, source: 'ai' } : null
}
