/**
 * Lettura precisa di ciò che i file di progetto DICHIARANO (invece di dedurlo
 * dal linguaggio): soluzioni e progetti .NET/C++ di Visual Studio, progetti
 * Visual Basic 6, e le versioni richieste negli altri ecosistemi (Node, Python,
 * Java, Go, Rust, PHP, Ruby, Dart).
 *
 * Esempio: una soluzione di "Visual Basic Express 2010" con un .vbproj che
 * punta a .NET Framework 4.0 richiede Visual Studio 2010 o successivo e il
 * .NET Framework 4.0 — non il .NET SDK (comando dotnet), che serve solo ai
 * progetti .NET "SDK" (net6.0, net8.0…).
 */

// --- Visual Studio: soluzioni -------------------------------------------------------------

export interface SolutionProject {
  name: string
  /** Percorso relativo alla soluzione, con "/". */
  path: string
  typeGuid: string
}
export interface SolutionInfo {
  /** Anno di Visual Studio con cui è stata creata (2010, 2022…), se si ricava. */
  vsYear: number | null
  /** Edizione indicata nell'intestazione (es. "Visual Basic Express 2010"). */
  edition: string
  projects: SolutionProject[]
}

/** Versione interna di Visual Studio → anno del prodotto. */
const VS_YEAR: Record<number, number> = { 8: 2005, 9: 2008, 10: 2010, 11: 2012, 12: 2013, 14: 2015, 15: 2017, 16: 2019, 17: 2022, 18: 2026 }
/** "Format Version" della soluzione → anno (dal 12.00 lo precisa la riga VisualStudioVersion). */
const FORMAT_YEAR: Record<string, number> = { '9.00': 2005, '10.00': 2008, '11.00': 2010, '12.00': 2012 }

/** Anno di Visual Studio da una versione interna ("10.0", "17.8.34330.188") o da un anno già tale. */
export function vsYearOf(version: string): number | null {
  const major = Number.parseInt(version, 10)
  if (!Number.isFinite(major)) return null
  if (major >= 2000) return major
  return VS_YEAR[major] ?? null
}

/** Legge una soluzione .sln: versione/edizione di Visual Studio e progetti contenuti. */
export function parseSolution(text: string): SolutionInfo {
  const format = /Format Version\s+(\d+\.\d+)/i.exec(text)?.[1] ?? ''
  const comment = /^#\s*(.+)$/m.exec(text)?.[1]?.trim() ?? ''
  const vsLine = /^VisualStudioVersion\s*=\s*([\d.]+)/m.exec(text)?.[1]
  const fromComment = /(?:Version\s+)?(\d{2,4})\b/.exec(comment)?.[1]
  const vsYear = (vsLine && vsYearOf(vsLine)) || (fromComment && vsYearOf(fromComment)) || FORMAT_YEAR[format] || null
  const projects: SolutionProject[] = []
  for (const m of text.matchAll(/^Project\("\{([0-9A-F-]+)\}"\)\s*=\s*"([^"]*)",\s*"([^"]*)"/gim)) {
    const path = m[3]!.replace(/\\/g, '/')
    // Le cartelle di soluzione non sono progetti
    if (/^2150E333-8FDC-42A3-9474-1A3956D46DE8$/i.test(m[1]!)) continue
    projects.push({ name: m[2]!, path, typeGuid: m[1]!.toUpperCase() })
  }
  return { vsYear, edition: /express|community|professional|enterprise/i.test(comment) ? comment : '', projects }
}

// --- Visual Studio: progetti MSBuild ------------------------------------------------------

export interface MsbuildProject {
  path: string
  language: 'C#' | 'VB.NET' | 'F#' | 'C++'
  /** Progetto "SDK" (.NET 5+ / .NET Core, o SDK-style anche per .NET Framework): serve il .NET SDK. */
  sdkStyle: boolean
  /** Framework di destinazione: "net8.0", "net48", "v4.0"… */
  targets: string[]
  /** Interfaccia o tipo riconosciuto: WinForms, WPF, ASP.NET Core, ASP.NET (Web Forms/MVC)… */
  kinds: string[]
  /** Visual Studio richiesto dai progetti classici (da ToolsVersion o PlatformToolset). */
  vsYear: number | null
}

/** ToolsVersion di MSBuild → anno di Visual Studio ("Current" = 2019 o successivo). */
const TOOLS_YEAR: Record<string, number> = { '2.0': 2005, '3.5': 2008, '4.0': 2010, '12.0': 2013, '14.0': 2015, '15.0': 2017, current: 2019 }
/** Set di strumenti C++ → anno di Visual Studio. */
const TOOLSET_YEAR: Record<string, number> = { v90: 2008, v100: 2010, v110: 2012, v120: 2013, v140: 2015, v141: 2017, v142: 2019, v143: 2022, v145: 2026 }

export function parseMsbuildProject(text: string, path: string): MsbuildProject {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  const language: MsbuildProject['language'] = ext === 'vbproj' ? 'VB.NET' : ext === 'fsproj' ? 'F#' : ext === 'vcxproj' || ext === 'vcproj' ? 'C++' : 'C#'
  const sdk = /<Project\s[^>]*\bSdk\s*=\s*"([^"]+)"/i.exec(text)?.[1] ?? ''
  const tags = (tag: string) => [...text.matchAll(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'gi'))].map((m) => m[1]!)
  const targets = [
    ...tags('TargetFramework'),
    ...tags('TargetFrameworks').flatMap((t) => t.split(';')),
    ...tags('TargetFrameworkVersion'),
  ].map((t) => t.trim()).filter(Boolean)
  const kinds: string[] = []
  const typeGuids = tags('ProjectTypeGuids').join(';').toUpperCase()
  if (/Microsoft\.NET\.Sdk\.Web/i.test(sdk)) kinds.push('ASP.NET Core')
  else if (/Microsoft\.NET\.Sdk\.BlazorWebAssembly/i.test(sdk)) kinds.push('Blazor')
  if (tags('UseWPF').some((v) => /true/i.test(v)) || typeGuids.includes('60DC8134-EBA5-43B8-BCC9-BB4BC16C2548')) kinds.push('WPF')
  if (tags('UseWindowsForms').some((v) => /true/i.test(v)) || /<Reference\s+Include="System\.Windows\.Forms"/i.test(text) || /<MyType>\s*WindowsForms/i.test(text))
    kinds.push('WinForms')
  if (typeGuids.includes('349C5851-65DF-11DA-9384-00065B846F21') || typeGuids.includes('E24C65DC-7377-472B-9ABA-BC803B73C61A')) kinds.push('ASP.NET')
  if (tags('UseMaui').some((v) => /true/i.test(v))) kinds.push('.NET MAUI')
  // Visual Studio dei progetti classici: ToolsVersion (4.0 = 2010, 12.0 = 2013…) o set di strumenti C++
  const tools = /<Project\s[^>]*\bToolsVersion\s*=\s*"([\w.]+)"/i.exec(text)?.[1]?.toLowerCase()
  const toolset = tags('PlatformToolset')[0]?.toLowerCase()
  const vsYear = (toolset && TOOLSET_YEAR[toolset]) || (tools ? TOOLS_YEAR[tools] : null) || null
  return { path, language, sdkStyle: !!sdk, targets, kinds, vsYear }
}

/** "v4.0" / "net48" / "net472" → "4.0" / "4.8" / "4.7.2"; null se non è .NET Framework. */
export function netFrameworkVersion(target: string): string | null {
  const t = target.trim().toLowerCase()
  const v = /^v(\d+\.\d+(?:\.\d+)?)$/.exec(t)?.[1]
  if (v) return v
  const net = /^net(\d)(\d)(\d)?$/.exec(t)
  return net ? [net[1], net[2], net[3]].filter(Boolean).join('.') : null
}
/** "net8.0" / "net8.0-windows" / "netcoreapp3.1" → "8.0" / "3.1"; null se non è .NET moderno. */
export function netCoreVersion(target: string): string | null {
  return /^net(?:coreapp)?(\d+\.\d+)/i.exec(target.trim())?.[1] ?? null
}

const maxVersion = (vs: string[]) =>
  vs.sort((a, b) => {
    const x = a.split('.').map(Number)
    const y = b.split('.').map(Number)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return 0
  })[vs.length - 1]

export interface PreciseRequirement {
  /** Nome del prerequisito (quello del catalogo, così funzionano link e verifica). */
  name: string
  version: string
}
export interface DotnetFindings {
  languages: string[]
  frameworks: string[]
  prerequisites: PreciseRequirement[]
  /** Prerequisiti del catalogo da NON proporre (es. .NET SDK per i soli progetti .NET Framework). */
  exclude: string[]
  /** Note per chi configura il PC. */
  notes: string[]
}

/**
 * Requisiti precisi di una soluzione/insieme di progetti Visual Studio.
 * `solution` può mancare (progetto aperto senza .sln).
 */
export function dotnetRequirements(solution: SolutionInfo | null, projects: MsbuildProject[], globalJsonSdk?: string | null): DotnetFindings {
  const out: DotnetFindings = { languages: [], frameworks: [], prerequisites: [], exclude: [], notes: [] }
  const add = (arr: string[], v: string) => void (!arr.includes(v) && arr.push(v))
  for (const p of projects) {
    add(out.languages, p.language)
    for (const k of p.kinds) add(out.frameworks, k)
  }
  const modern = projects.filter((p) => p.sdkStyle)
  const classic = projects.filter((p) => !p.sdkStyle)
  const fxVersions = projects.flatMap((p) => p.targets.map(netFrameworkVersion).filter((v): v is string => !!v))
  const coreVersions = modern.flatMap((p) => p.targets.map(netCoreVersion).filter((v): v is string => !!v))

  if (fxVersions.length) add(out.frameworks, '.NET Framework')
  // Progetti "SDK" (.NET moderno) anche senza versione leggibile
  if (coreVersions.length || modern.some((p) => !p.targets.some((t) => netFrameworkVersion(t)))) add(out.frameworks, '.NET')

  // .NET SDK solo per i progetti "SDK"; versione: global.json, altrimenti il framework più recente
  if (modern.length) {
    const v = globalJsonSdk?.trim() || (coreVersions.length ? `${maxVersion([...coreVersions])!.split('.')[0]}+` : '')
    out.prerequisites.push({ name: '.NET SDK', version: globalJsonSdk ? `${globalJsonSdk}+` : v })
  } else if (projects.length) {
    out.exclude.push('.NET SDK')
  }

  // Visual Studio per i progetti classici (e per il C++): la versione con cui è stata creata la soluzione, o successiva
  if (classic.length) {
    const years = [solution?.vsYear, ...classic.map((p) => p.vsYear)].filter((y): y is number => !!y)
    const year = years.length ? Math.max(...years) : null
    const edition = solution?.edition ? ` (${solution.edition})` : ''
    const cpp = classic.some((p) => p.language === 'C++') ? ' con «Sviluppo di applicazioni desktop con C++»' : ''
    out.prerequisites.push({ name: 'Visual Studio', version: year ? `${year}+${edition}${cpp}` : `${edition}${cpp}`.trim() })
    // Nessuna proposta generica di Visual Studio 2022 o Build Tools
    out.exclude.push('Visual Studio Build Tools')
  }
  // .NET Framework: il runtime (e il "targeting pack") della versione dichiarata
  if (fxVersions.length) {
    const v = maxVersion([...fxVersions])!
    out.prerequisites.push({ name: '.NET Framework', version: `${v}+` })
    if (Number.parseFloat(v) < 4.6)
      out.notes.push(
        `Il progetto punta a .NET Framework ${v}: le versioni recenti di Visual Studio non lo compilano senza il relativo "targeting pack"; in alternativa si può portare il progetto a .NET Framework 4.8.`,
      )
  }
  return out
}

// --- Visual Basic 6 -------------------------------------------------------------------

/** Un progetto Visual Basic 6 (.vbp): tipo di eseguibile e riferimenti. */
export function parseVbp(text: string): { exe: boolean; name: string } {
  return { exe: /^Type\s*=\s*Exe/im.test(text), name: /^Name\s*=\s*"([^"]*)"/im.exec(text)?.[1] ?? '' }
}

// --- Versioni dichiarate negli altri ecosistemi ------------------------------------------

/** Pulisce una versione dichiarata ("^18.17.0", ">=3.11,<4", "~> 3.2") in un requisito leggibile ("18.17+"). */
function asMin(spec: string): string {
  const v = /(\d+(?:\.\d+){0,2})/.exec(spec)?.[1]
  return v ? `${v}+` : ''
}

/**
 * Versioni richieste dai file del progetto, per nome di prerequisito del
 * catalogo (es. { 'Node.js': '18.17+', 'pnpm': '9.1.0' }). `read` legge un
 * file della radice (null se manca).
 */
export async function versionHints(read: (name: string) => Promise<string | null>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const set = (k: string, v: string) => void (v && !out[k] && (out[k] = v))
  const json = async (name: string) => {
    const t = await read(name)
    try {
      return t ? (JSON.parse(t) as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  // Node e gestori di pacchetti
  const pkg = await json('package.json')
  if (pkg) {
    const engines = (pkg.engines ?? {}) as Record<string, string>
    if (engines.node) set('Node.js', asMin(engines.node))
    const pm = typeof pkg.packageManager === 'string' ? /^(pnpm|yarn|npm)@(\d+(?:\.\d+){0,2})/.exec(pkg.packageManager) : null
    if (pm && pm[1] === 'pnpm') set('pnpm', `${pm[2]}+`)
    if (pm && pm[1] === 'yarn') set('Yarn', `${pm[2]}+`)
  }
  set('Node.js', asMin((await read('.nvmrc')) ?? (await read('.node-version')) ?? ''))
  // Python
  set('Python', asMin((await read('.python-version')) ?? ''))
  const py = await read('pyproject.toml')
  if (py) set('Python', asMin(/requires-python\s*=\s*"([^"]+)"/.exec(py)?.[1] ?? ''))
  // Go
  const gomod = await read('go.mod')
  if (gomod) set('Go', asMin(/^go\s+(\d+\.\d+(?:\.\d+)?)/m.exec(gomod)?.[1] ?? ''))
  // Java (Maven)
  const pom = await read('pom.xml')
  if (pom) {
    const java = /<(?:maven\.compiler\.release|maven\.compiler\.source|java\.version|release)>\s*(\d+(?:\.\d+)?)\s*</.exec(pom)?.[1]
    if (java) set('Java JDK', `${java.startsWith('1.') ? java.slice(2) : java}+`)
  }
  // Rust
  const cargo = await read('Cargo.toml')
  if (cargo) set('Rust', asMin(/^rust-version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1] ?? ''))
  // PHP
  const composer = await json('composer.json')
  const php = composer ? ((composer.require ?? {}) as Record<string, string>).php : undefined
  if (php) set('PHP', asMin(php))
  // Ruby
  set('Ruby', asMin((await read('.ruby-version')) ?? ''))
  // Dart / Flutter
  const pubspec = await read('pubspec.yaml')
  if (pubspec) {
    const flutter = /^\s*flutter:\s*['"]?([^'"\n]+)/m.exec(/environment:[\s\S]*?(?=\n\S|$)/.exec(pubspec)?.[0] ?? '')?.[1]
    if (flutter) set('Flutter SDK', asMin(flutter))
  }
  return out
}
