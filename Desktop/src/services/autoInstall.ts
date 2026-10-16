/**
 * Installazione automatica dei prerequisiti mancanti (Windows) con winget, la
 * Gestione pacchetti di Windows: per i prerequisiti noti si sa quale pacchetto
 * installare (scelto in base alla versione richiesta); per gli altri lo può
 * cercare l'IA locale, e il pacchetto proposto si accetta solo se winget lo
 * conosce davvero. Si eseguono solo installazioni di pacchetti winget, mai
 * comandi proposti dall'IA.
 *
 * L'installazione la esegue l'app (senza finestre: Windows chiede le
 * autorizzazioni dove servono) mostrando fase e avanzamento per ciascun
 * prerequisito; finita, si ricontrolla e il prerequisito si spunta da solo.
 */
import { z } from 'zod'
import { locale } from '@/i18n'
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

/** Comando winget che installa il pacchetto (solo identificativi validi: niente altri comandi). */
export function wingetInstallCommand(p: InstallPlan): string | null {
  if (!isWingetId(p.id)) return null
  const override = p.override ? ` --override "${p.override.replace(/"/g, '')}"` : ''
  return `winget install --id ${p.id} -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity${override}`
}

export type InstallPhase = 'download' | 'verify' | 'install'

/**
 * Fase e avanzamento da una riga di output di winget (italiano e inglese):
 * "12.0 MB / 50.0 MB" o "45%" = scaricamento; hash = verifica; installazione.
 */
export function wingetProgress(line: string): { phase?: InstallPhase; pct?: number } {
  const unit = (n: string, u: string) => Number(n.replace(',', '.')) * ({ KB: 1e3, MB: 1e6, GB: 1e9 } as Record<string, number>)[u.toUpperCase()]!
  const bytes = /(\d+(?:[.,]\d+)?)\s*(KB|MB|GB)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(KB|MB|GB)/i.exec(line)
  if (bytes) {
    const total = unit(bytes[3]!, bytes[4]!)
    return { phase: 'download', pct: total ? Math.min(100, Math.round((unit(bytes[1]!, bytes[2]!) / total) * 100)) : undefined }
  }
  const pct = /(\d{1,3})\s*%/.exec(line)
  if (pct) return { phase: 'download', pct: Math.min(100, Number(pct[1])) }
  if (/hash|verific/i.test(line)) return { phase: 'verify' }
  if (/install/i.test(line)) return { phase: 'install' }
  if (/download|scaric/i.test(line)) return { phase: 'download' }
  return {}
}

/** winget dice che il pacchetto c'è già (aggiornato o no): non è un errore. */
export const wingetAlreadyInstalled = (lines: string[]) => lines.some((l) => /already installed|gi[aà] installat|no (available )?upgrade|nessun aggiornamento/i.test(l))

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
