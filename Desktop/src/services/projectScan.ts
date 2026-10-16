/**
 * Riconoscimento dei progetti già esistenti in una cartella (es. Z:\Progetti):
 * ogni sottocartella che contiene un progetto (repository git, package.json,
 * Cargo.toml, soluzione .NET, pyproject…) può diventare un progetto del
 * workspace con il nome della cartella. Dai file del progetto si ricava lo
 * Stack: cartella, repository, linguaggi, framework, passi base, README.
 */
import { getFs } from './fs'
import { newId } from './ids'
import { compareText, defineMessages } from '@/i18n'
import { KNOWN_LANGUAGES, KNOWN_PREREQUISITES, lookupPrerequisite, suggestPrerequisites } from './prerequisites'
import { dotnetRequirements, parseMsbuildProject, parseSolution, versionHints, type MsbuildProject, type PreciseRequirement } from './manifests'
import { editorStep, isEditorStep, isRunStep, mergeImportedStack, parseStackMarkdown, platformsFor } from './stackDoc'
import { EMPTY_STACK, type SetupStep, type Stack } from '@/types'

export interface DetectedProject {
  /** Nome della cartella: diventa il nome del progetto. */
  name: string
  path: string
  /** File o cartelle che l'hanno fatto riconoscere (es. ".git", "package.json"). */
  markers: string[]
}

// --- Cartella dei progetti (workspace): riconoscimento delle sottocartelle-progetto -----

/** File e cartelle che indicano un progetto, fra le sottocartelle della cartella dei progetti. */
const MARKER_FILES = [
  'package.json', 'cargo.toml', 'pyproject.toml', 'requirements.txt', 'setup.py', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'composer.json', 'pubspec.yaml', 'gemfile', 'readme.md', 'deno.json',
]
const MARKER_EXT = /\.(sln|csproj|vbproj|fsproj|vcxproj|vbp|dproj|lpi|pjx|pbw)$/i
const MARKER_DIRS = ['.git', 'src-tauri']
/** Cartelle da non considerare mai progetti. */
const SKIP = /^(\.|node_modules$|\$recycle\.bin$|system volume information$)/i
/** Il solo README non basta per riconoscere la cartella principale come progetto. */
const WEAK = new Set(['readme.md'])

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
/** `child` è uguale a `parent` o sta al suo interno? (confronto senza maiuscole, separatori indifferenti) */
export const isInside = (child: string, parent: string) => {
  const c = norm(child)
  const p = norm(parent)
  return c === p || c.startsWith(p + '/')
}
export const samePath = (a: string, b: string) => norm(a) === norm(b)

/**
 * Cartella dei progetti ricavata dalle cartelle dei singoli progetti: la
 * cartella madre più frequente (es. Z:\Progetti per Z:\Progetti\Alfa e
 * Z:\Progetti\Beta). Serve ai workspace creati prima che la cartella dei
 * progetti venisse salvata. '' se non ci sono cartelle da cui ricavarla.
 */
export function inferProjectsPath(projectDirs: string[]): string {
  const counts = new Map<string, { path: string; n: number }>()
  for (const dir of projectDirs) {
    const d = dir.trim().replace(/[\\/]+$/, '')
    const cut = Math.max(d.lastIndexOf('/'), d.lastIndexOf('\\'))
    if (cut <= 0) continue
    const parent = d.slice(0, cut)
    // "C:" da solo non è una cartella dei progetti credibile
    if (/^[a-z]:$/i.test(parent)) continue
    const k = norm(parent)
    const e = counts.get(k) ?? { path: parent, n: 0 }
    e.n++
    counts.set(k, e)
  }
  let best: { path: string; n: number } | null = null
  for (const e of counts.values()) if (!best || e.n > best.n) best = e
  return best?.path ?? ''
}

async function markersOf(path: string): Promise<{ markers: string[]; isWorkspace: boolean }> {
  const fs = await getFs()
  const entries = await fs.listDir(path).catch(() => [])
  const markers: string[] = []
  let isWorkspace = false
  for (const e of entries) {
    const n = e.name.toLowerCase()
    if (!e.isDir && n === 'workspace.json') isWorkspace = true
    if (e.isDir ? MARKER_DIRS.includes(n) : MARKER_FILES.includes(n) || MARKER_EXT.test(n)) markers.push(e.name)
  }
  return { markers, isWorkspace }
}

/**
 * Progetti contenuti in una cartella: le sottocartelle (primo livello) che ne
 * hanno l'aspetto, esclusi i workspace di Todo Doto. Se nessuna
 * sottocartella è un progetto ma lo è la cartella stessa, restituisce quella.
 */
export async function scanProjects(root: string): Promise<DetectedProject[]> {
  const fs = await getFs()
  const entries = await fs.listDir(root).catch(() => [])
  const found: DetectedProject[] = []
  for (const e of entries) {
    if (!e.isDir || SKIP.test(e.name)) continue
    const path = await fs.join(root, e.name)
    const { markers, isWorkspace } = await markersOf(path)
    if (markers.length && !isWorkspace) found.push({ name: e.name, path, markers })
  }
  if (!found.length) {
    const { markers, isWorkspace } = await markersOf(root)
    if (!isWorkspace && markers.some((m) => !WEAK.has(m.toLowerCase()))) {
      const name = root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? root
      found.push({ name, path: root, markers })
    }
  }
  return found.sort((a, b) => compareText(a.name, b.name))
}

// --- Cartella di un singolo progetto (acquisizione di un progetto) -------------------
// Distinta dalla cartella dei progetti: qui si guarda una sola cartella e la si
// riconosce come progetto di qualunque tipo o linguaggio, non le sue sottocartelle.

/** File che indicano un progetto, di qualunque linguaggio o strumento di build. */
const SINGLE_FILES = new Set([
  ...MARKER_FILES.filter((f) => f !== 'readme.md'),
  'tsconfig.json', 'angular.json', 'makefile', 'cmakelists.txt', 'meson.build', 'build.xml', 'build.sbt', 'settings.gradle', 'settings.gradle.kts',
  'package.swift', 'mix.exs', 'rebar.config', 'stack.yaml', 'project.clj', 'deps.edn', 'rakefile', 'pipfile', 'environment.yml', 'manage.py',
  'dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'index.html', 'global.json', 'directory.build.props', 'nuget.config',
])
const SINGLE_EXT = /\.(sln|slnx|csproj|vbproj|fsproj|vcxproj|cabal|gemspec|nimble|vbp|dproj|dpr|dpk|lpi|pjx|pbw|pbt|pbproj|accdb|accde|mdb|pro)$/i
const SINGLE_DIRS = new Set(['.git', '.svn', '.hg', 'src-tauri', '.vscode', '.idea'])
const SINGLE_DIR_EXT = /\.(xcodeproj|xcworkspace)$/i
/** File sorgente di qualunque linguaggio: bastano a riconoscere un progetto. */
const SOURCE_EXT =
  /\.(js|mjs|cjs|jsx|ts|tsx|vue|svelte|astro|py|ipynb|rb|php|java|kt|kts|scala|groovy|go|rs|c|h|cc|cpp|cxx|hpp|cs|vb|fs|swift|m|mm|dart|lua|pl|pm|r|jl|ex|exs|erl|hs|clj|cljs|elm|zig|nim|sql|sh|ps1|psm1|bat|cmd|html?|css|scss|sass|less|xaml|razor|cshtml|asm|f90|pas|dpr|lisp|ml)$/i
/** Sottocartelle dove di solito stanno i sorgenti. */
const SOURCE_DIRS = new Set(['src', 'app', 'lib', 'source', 'sources', 'scripts'])
/** File di sistema da non contare (una cartella con solo questi è vuota). */
const SYSTEM_FILES = /^(desktop\.ini|thumbs\.db|\.ds_store|\$recycle\.bin|system volume information)$/i

/** Cosa fa riconoscere una singola cartella come progetto (vuoto se non lo è). */
async function singleProjectMarkers(path: string, entries: { name: string; isDir: boolean }[]): Promise<string[]> {
  const fs = await getFs()
  const markers = entries
    .filter((e) => (e.isDir ? SINGLE_DIRS.has(e.name.toLowerCase()) || SINGLE_DIR_EXT.test(e.name) : SINGLE_FILES.has(e.name.toLowerCase()) || SINGLE_EXT.test(e.name)))
    .map((e) => e.name)
  if (markers.length) return markers
  // Nessun file di progetto noto: bastano dei sorgenti, nella cartella o in src/, app/…
  const source = entries.find((e) => !e.isDir && SOURCE_EXT.test(e.name))
  if (source) return [source.name]
  for (const d of entries.filter((e) => e.isDir && SOURCE_DIRS.has(e.name.toLowerCase()))) {
    const inner = await fs.listDir(await fs.join(path, d.name)).catch(() => [])
    const f = inner.find((e) => !e.isDir && SOURCE_EXT.test(e.name))
    if (f) return [`${d.name}/${f.name}`]
  }
  return []
}

export type FolderKind =
  /** La cartella non esiste ancora: il progetto si crea da zero. */
  | 'missing'
  /** Esiste ed è vuota: il progetto si crea da zero. */
  | 'empty'
  /** Contiene un progetto (di qualunque tipo o linguaggio): se ne importa la struttura. */
  | 'project'
  /** Contiene più progetti nelle sottocartelle: è una cartella di progetti, non di un progetto. */
  | 'projects'
  /** È la cartella Dati di un workspace di Todo Doto. */
  | 'workspace'
  /** Contiene file, ma non un progetto riconoscibile. */
  | 'other'

/**
 * Che cosa c'è nella cartella scelta per un singolo progetto. `markers`: cosa
 * l'ha fatta riconoscere come progetto; per 'projects', i progetti trovati.
 */
export async function inspectFolder(path: string): Promise<{ kind: FolderKind; markers: string[] }> {
  const fs = await getFs()
  const p = path.trim()
  if (!p || !(await fs.exists(p))) return { kind: 'missing', markers: [] }
  const entries = (await fs.listDir(p)).filter((e) => !SYSTEM_FILES.test(e.name))
  if (!entries.length) return { kind: 'empty', markers: [] }
  if (entries.some((e) => !e.isDir && e.name.toLowerCase() === 'workspace.json')) return { kind: 'workspace', markers: [] }
  const markers = await singleProjectMarkers(p, entries)
  if (markers.length) return { kind: 'project', markers }
  // Nessun progetto qui, ma più progetti nelle sottocartelle: è una cartella di progetti
  const inside = (await scanProjects(p)).filter((x) => !samePath(x.path, p))
  if (inside.length > 1) return { kind: 'projects', markers: inside.map((x) => x.name) }
  return { kind: 'other', markers: [] }
}

const M = defineMessages({
  it: {
    install: 'Installa le dipendenze',
    clone: 'Clona il repository',
    restore: 'Ripristina i pacchetti NuGet',
    pipInstall: 'Installa i pacchetti Python',
    delphiVersion: (v: string) => `Progetto Delphi creato con RAD Studio (ProjectVersion ${v}): aprilo con la stessa versione di RAD Studio o una successiva.`,
    cppWorkload: 'con «Sviluppo di applicazioni desktop con C++»',
  },
  en: {
    install: 'Install the dependencies',
    clone: 'Clone the repository',
    restore: 'Restore the NuGet packages',
    pipInstall: 'Install the Python packages',
    delphiVersion: (v: string) => `Delphi project created with RAD Studio (ProjectVersion ${v}): open it with the same RAD Studio version or a later one.`,
    cppWorkload: 'with “Desktop development with C++”',
  },
})

/** Dipendenze npm → framework e librerie riconosciuti. */
const NPM_FRAMEWORKS: [RegExp, string][] = [
  [/^react-native$/, 'React Native'],
  [/^expo$/, 'Expo'],
  [/^react$/, 'React'],
  [/^@angular\/core$/, 'Angular'],
  [/^svelte$/, 'Svelte'],
  [/^next$/, 'Next.js'],
  [/^nuxt$/, 'Nuxt'],
  [/^astro$/, 'Astro'],
  [/^vite$/, 'Vite'],
  [/^tailwindcss$/, 'Tailwind CSS'],
  [/^pinia$/, 'Pinia'],
  [/^express$/, 'Express'],
  [/^@nestjs\/core$/, 'NestJS'],
  [/^electron$/, 'Electron'],
  [/^@tauri-apps\/(api|cli)$/, 'Tauri'],
  [/^@ionic\/(core|vue|react|angular)$/, 'Ionic'],
  [/^@capacitor\/core$/, 'Capacitor'],
  [/^@supabase\/supabase-js$/, 'Supabase'],
  [/^firebase$/, 'Firebase'],
  [/^vitest$/, 'Vitest'],
  [/^jest$/, 'Jest'],
  [/^@playwright\/test$/, 'Playwright'],
]

/** URL del repository da .git/config (origin), anche in forma SSH, senza credenziali. */
export function repoFromGitConfig(config: string): string {
  const origin = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(config)?.[1] ?? /url\s*=\s*(\S+)/.exec(config)?.[1]
  if (!origin) return ''
  const ssh = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/.exec(origin)
  const url = ssh ? `https://${ssh[1]}/${ssh[2]}` : origin.replace(/^(https?:\/\/)[^@/]+@/, '$1')
  return url.replace(/\.git$/, '')
}

/**
 * Stack di un progetto esistente ricavato dai suoi file: cartella, repository
 * git, linguaggi e framework (package.json, Cargo.toml, .csproj, pyproject…),
 * passi base (installazione, avvio), prerequisiti necessari e quanto si legge
 * nel README / ARCHITETTURA.md (che resta memorizzato come documento).
 */
export async function detectStack(path: string, trace?: ScanTrace): Promise<DetectedStack> {
  const fs = await getFs()
  const at = async (rel: string) => (rel ? fs.join(path, ...rel.split('/')) : path)
  const source: ProjectSource = {
    // La cartella del progetto deve leggersi: un errore (rete, permessi) non diventa uno stack vuoto
    list: async (sub = '') => (sub ? fs.listDir(await at(sub)).catch(() => []) : fs.listDir(path)),
    read: async (name) => fs.readText(await at(name)).catch(() => null),
    gitConfig: async () => fs.readText(await fs.join(path, '.git', 'config')).catch(() => ''),
  }
  return stackFromSource(trace ? traced(source, trace) : source, { sourcePath: path })
}

/**
 * Cosa ha letto l'analisi: elenchi delle cartelle e file (nell'ordine di
 * lettura). Serve all'analisi approfondita, che riceve solo questo. La
 * configurazione git (.git/config) non vi finisce mai.
 */
export interface ScanTrace {
  listings: Map<string, { name: string; isDir: boolean }[]>
  files: Map<string, string>
}
export const newScanTrace = (): ScanTrace => ({ listings: new Map(), files: new Map() })

function traced(src: ProjectSource, trace: ScanTrace): ProjectSource {
  return {
    async list(sub = '') {
      const r = await src.list(sub)
      if (!trace.listings.has(sub)) trace.listings.set(sub, r)
      return r
    },
    async read(name) {
      const r = await src.read(name)
      if (r !== null && !trace.files.has(name)) trace.files.set(name, r)
      return r
    },
    gitConfig: src.gitConfig ? () => src.gitConfig!() : undefined,
  }
}

/** Sottocartelle da non esplorare cercando i file di progetto (dipendenze, output di build, strumenti). */
const DEEP_SKIP = /^(\.|node_modules$|bin$|obj$|dist$|build$|out$|target$|packages$|vendor$|venv$|env$|__pycache__$|coverage$|debug$|release$|\$recycle\.bin$)/i
/** Cartelle che di solito contengono più parti di un progetto: vi si guarda un livello più in giù. */
const CONTAINER_DIRS = /^(src|source|sources|apps?|services|projects|modules|packages|code)$/i

/** Stack ricavato dai file; `excluded`: prerequisiti che i file dicono NON servire (es. .NET SDK per .NET Framework). */
export interface DetectedStack {
  description: string
  stack: Stack
  excluded: string[]
}

/**
 * Corregge i prerequisiti esistenti con quelli appena rilevati dai file: la
 * versione dichiarata dai file prevale; i prerequisiti che i file escludono si
 * tolgono. Restituisce lo stack corretto e quante correzioni ha fatto.
 */
export function correctPrerequisites(current: Stack, detected: DetectedStack): { stack: Stack; corrected: number } {
  const canon = (n: string) => lookupPrerequisite(n)?.name ?? n
  const byName = new Map(detected.stack.prerequisites.map((p) => [canon(p.name), p]))
  let corrected = 0
  const prerequisites = current.prerequisites
    .filter((p) => {
      const drop = detected.excluded.includes(canon(p.name))
      if (drop) corrected++
      return !drop
    })
    .map((p) => {
      const d = byName.get(canon(p.name))
      if (!d || !d.version || d.version === p.version) return p
      corrected++
      return { ...p, version: d.version }
    })
  return { stack: { ...current, prerequisites }, corrected }
}

/** Dove si leggono i file di un progetto: una cartella locale o un repository remoto (es. GitHub). */
export interface ProjectSource {
  /** File e cartelle della radice del progetto, o di una sua sottocartella (percorso relativo con "/"). */
  list(sub?: string): Promise<{ name: string; isDir: boolean }[]>
  /** Contenuto di un file (percorso relativo con "/"; null se manca o non si legge). */
  read(name: string): Promise<string | null>
  /** Configurazione git locale (.git/config), per ricavare il repository. */
  gitConfig?(): Promise<string>
}

/**
 * Stack ricavato dai file di un progetto, da qualunque sorgente. `repoUrl` e
 * `languages` (es. le statistiche dei linguaggi di GitHub) completano quanto
 * si legge dai file.
 */
export async function stackFromSource(
  src: ProjectSource,
  info: { sourcePath?: string; repoUrl?: string; languages?: string[]; clone?: boolean } = {},
): Promise<DetectedStack> {
  const entries = await src.list()
  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e]))
  const read = async (name: string) => {
    const e = byName.get(name.toLowerCase())
    if (!e || e.isDir) return null
    return src.read(e.name)
  }
  const s: Stack = { ...JSON.parse(JSON.stringify(EMPTY_STACK)), sourcePath: info.sourcePath ?? '' }
  const lang = (l: string) => void (!s.languages.includes(l) && s.languages.push(l))
  const fw = (f: string) => void (!s.frameworks.includes(f) && s.frameworks.push(f))
  const step = (title: string, command: string, kind: SetupStep['kind'] = 'command') =>
    s.steps.push({ id: newId('stp'), title, kind, command, cwd: '', url: '', notes: '' })

  // Repository
  if (info.repoUrl) s.repoUrl = info.repoUrl
  else if (byName.get('.git')?.isDir && src.gitConfig) s.repoUrl = repoFromGitConfig(await src.gitConfig())

  // Repository remoto: il primo passo è clonarlo nella cartella del progetto
  if (info.clone && s.repoUrl) step(M.clone, `git clone ${s.repoUrl}.git .`)

  /**
   * Linguaggi, framework e passi dai file di progetto di una cartella (`dir`
   * relativa alla radice, '' = radice). true se vi ha trovato un progetto.
   */
  let firstProj: string | undefined
  /** Prerequisiti precisi letti dai file di progetto (con la versione dichiarata). */
  const precise: PreciseRequirement[] = []
  /** Prerequisiti del catalogo da non proporre (es. .NET SDK per un progetto .NET Framework). */
  const excluded = new Set<string>()
  const notes: string[] = []
  async function scanDir(dir: string, items: { name: string; isDir: boolean }[]): Promise<boolean> {
    const names = new Map(items.map((e) => [e.name.toLowerCase(), e]))
    const rel = (name: string) => (dir ? `${dir}/${name}` : name)
    const readHere = async (name: string) => {
      const e = names.get(name.toLowerCase())
      if (!e || e.isDir) return null
      return dir ? src.read(rel(e.name)) : read(e.name)
    }
    const stepHere = (title: string, command: string) =>
      s.steps.push({ id: newId('stp'), title: dir ? `${title} (${dir})` : title, kind: 'command', command, cwd: dir.replace(/\//g, '\\'), url: '', notes: '' })
    let found = false

    // JavaScript / TypeScript
    const pkgText = await readHere('package.json')
    if (pkgText) {
      found = true
      try {
        const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }
        lang(deps.typescript || names.has('tsconfig.json') ? 'TypeScript' : 'JavaScript')
        if (deps.vue) fw(/^\D*3/.test(deps.vue) ? 'Vue 3' : 'Vue')
        for (const name of Object.keys(deps)) for (const [re, f] of NPM_FRAMEWORKS) if (re.test(name)) fw(f)
        const pm = names.has('pnpm-lock.yaml') ? 'pnpm' : names.has('yarn.lock') ? 'yarn' : 'npm'
        stepHere(M.install, pm === 'yarn' ? 'yarn' : `${pm} install`)
      } catch {
        /* package.json non valido: si ignora */
      }
    }
    // Rust / Tauri
    if (names.get('src-tauri')?.isDir) {
      found = true
      fw('Tauri')
      lang('Rust')
    }
    if (names.has('cargo.toml')) {
      found = true
      lang('Rust')
    }
    // Visual Studio (.NET e C++): si legge cosa dichiarano soluzione e progetti, non si deduce
    const projFiles = items.filter((e) => !e.isDir && /\.(csproj|vbproj|fsproj|vcxproj)$/i.test(e.name))
    const slnFile = items.find((e) => !e.isDir && /\.sln$/i.test(e.name))
    if (projFiles.length || slnFile) {
      found = true
      firstProj ??= rel((slnFile ?? projFiles[0])!.name)
      const sln = slnFile ? parseSolution((await readHere(slnFile.name)) ?? '') : null
      // Progetti della soluzione (anche nelle sottocartelle), altrimenti quelli della cartella
      const paths = sln?.projects.length ? sln.projects.map((x) => x.path).filter((x) => /\.(csproj|vbproj|fsproj|vcxproj)$/i.test(x)) : projFiles.map((e) => e.name)
      const parsed: MsbuildProject[] = []
      for (const path of paths.slice(0, 40)) {
        const text = await src.read(rel(path)).catch(() => null)
        if (text) parsed.push(parseMsbuildProject(text, path))
      }
      // Progetto non leggibile: almeno il linguaggio dall'estensione (mai un "C#" a caso)
      if (!parsed.length) {
        for (const path of paths) {
          const ext = path.toLowerCase()
          lang(ext.endsWith('.vbproj') ? 'VB.NET' : ext.endsWith('.fsproj') ? 'F#' : ext.endsWith('.vcxproj') ? 'C++' : 'C#')
        }
      }
      const globalJson = await readHere('global.json')
      const sdk = globalJson ? (/"version"\s*:\s*"([\d.]+)"/.exec(globalJson)?.[1] ?? null) : null
      const findings = dotnetRequirements(sln, parsed, sdk)
      for (const l of findings.languages) lang(l)
      for (const f of findings.frameworks) fw(f)
      for (const p of findings.prerequisites) if (!precise.some((x) => x.name === p.name)) precise.push(p)
      for (const n of findings.exclude) excluded.add(n)
      notes.push(...findings.notes)
      if (parsed.some((x) => x.sdkStyle) && !s.steps.some((x) => x.command === 'dotnet restore')) stepHere(M.restore, 'dotnet restore')
    }
    // Visual Basic 6 (.vbp)
    const vbp = items.find((e) => !e.isDir && /\.vbp$/i.test(e.name))
    if (vbp) {
      found = true
      firstProj ??= rel(vbp.name)
      lang('Visual Basic 6')
      if (!precise.some((x) => x.name === 'Visual Basic 6.0')) precise.push({ name: 'Visual Basic 6.0', version: '' })
      excluded.add('.NET SDK')
    }
    // --- Altri progetti desktop: si legge cosa dichiarano i file ---
    const addPrecise = (name: string, version: string) => void (!precise.some((x) => x.name === name) && precise.push({ name, version }))
    const file = (re: RegExp) => items.find((e) => !e.isDir && re.test(e.name))
    // Delphi (RAD Studio): VCL o FireMonkey, versione del progetto
    const dproj = file(/\.dproj$/i) ?? file(/\.(dpr|dpk)$/i)
    if (dproj) {
      found = true
      firstProj ??= rel(dproj.name)
      lang('Delphi')
      fw('Delphi')
      const t = /\.dproj$/i.test(dproj.name) ? ((await readHere(dproj.name)) ?? '') : ''
      const ui = /<FrameworkType>\s*(VCL|FMX)\s*</i.exec(t)?.[1]?.toUpperCase()
      if (ui) fw(ui === 'FMX' ? 'FireMonkey' : 'VCL')
      const pv = /<ProjectVersion>\s*([\d.]+)\s*</i.exec(t)?.[1]
      if (pv) notes.push(M.delphiVersion(pv))
    }
    // Lazarus / Free Pascal
    const lpi = file(/\.lpi$/i)
    if (lpi) {
      found = true
      firstProj ??= rel(lpi.name)
      lang('Object Pascal')
      fw('Lazarus')
    }
    // C/C++ con CMake (ed eventualmente Qt): versioni minime dichiarate
    const cmake = await readHere('CMakeLists.txt')
    if (cmake !== null) {
      found = true
      lang(/LANGUAGES\s+C\b(?!\+)/i.test(cmake) && !/\bCXX\b/i.test(cmake) ? 'C' : 'C++')
      fw('CMake')
      const min = /cmake_minimum_required\s*\(\s*VERSION\s+([\d.]+)/i.exec(cmake)?.[1]
      if (min) addPrecise('CMake', `${min}+`)
      const qt = /find_package\s*\(\s*Qt(\d)/i.exec(cmake)?.[1]
      if (qt) {
        fw('Qt')
        addPrecise('Qt', `${qt}+`)
      }
    }
    // Qt con qmake (.pro)
    const pro = file(/\.pro$/i)
    if (pro) {
      const t = (await readHere(pro.name)) ?? ''
      if (/^\s*QT\s*\+?=/m.test(t) || /^\s*TEMPLATE\s*=/m.test(t)) {
        found = true
        firstProj ??= rel(pro.name)
        lang('C++')
        fw('Qt')
      }
    }
    // Microsoft Access, Visual FoxPro, PowerBuilder
    const access = file(/\.(accdb|accde|mdb|mde)$/i)
    if (access) {
      found = true
      firstProj ??= rel(access.name)
      lang('VBA')
      fw('Microsoft Access')
    }
    const fox = file(/\.pjx$/i)
    if (fox) {
      found = true
      firstProj ??= rel(fox.name)
      lang('Visual FoxPro')
      fw('Visual FoxPro')
    }
    const pb = file(/\.(pbw|pbt|pbproj|pbsln)$/i)
    if (pb) {
      found = true
      firstProj ??= rel(pb.name)
      lang('PowerScript')
      fw('PowerBuilder')
    }
    // Flutter per desktop Windows: serve Visual Studio con il C++
    if (names.has('pubspec.yaml') && names.get('windows')?.isDir) {
      fw('Flutter desktop')
      addPrecise('Visual Studio', `2022+ ${M.cppWorkload}`)
    }
    // Go desktop: Fyne (serve un compilatore C) o Wails
    const gomodText = names.has('go.mod') ? ((await readHere('go.mod')) ?? '') : ''
    if (/fyne\.io\/fyne/.test(gomodText)) fw('Fyne')
    if (/github\.com\/wailsapp\/wails/.test(gomodText)) fw('Wails')

    // Python
    const pyproject = await readHere('pyproject.toml')
    const requirements = await readHere('requirements.txt')
    // Python senza file di progetto: bastano i sorgenti; Tkinter si vede dagli import
    const pyFiles = items.filter((e) => !e.isDir && /\.pyw?$/i.test(e.name)).slice(0, 5)
    if (pyFiles.length && pyproject === null && requirements === null && !names.has('setup.py')) {
      found = true
      lang('Python')
    }
    for (const f of pyFiles) {
      const t = (await readHere(f.name)) ?? ''
      if (/^\s*(import tkinter|from tkinter)/m.test(t)) fw('Tkinter')
      if (/^\s*(import|from) (PyQt[56]|PySide[26]?)/m.test(t)) fw(/PySide/.test(t) ? 'PySide' : 'PyQt')
    }
    if (pyproject !== null || requirements !== null || names.has('setup.py')) {
      found = true
      lang('Python')
      const text = `${pyproject ?? ''}\n${requirements ?? ''}`.toLowerCase()
      if (/\bdjango\b/.test(text)) fw('Django')
      if (/\bflask\b/.test(text)) fw('Flask')
      if (/\bfastapi\b/.test(text)) fw('FastAPI')
      if (/\bpyqt[56]\b/.test(text)) fw('PyQt')
      if (/\bpyside[26]?\b/.test(text)) fw('PySide')
      if (/\bwxpython\b/.test(text)) fw('wxPython')
      if (/\bkivy\b/.test(text)) fw('Kivy')
      if (requirements !== null) stepHere(M.pipInstall, 'pip install -r requirements.txt')
    }
    // Altri ecosistemi
    if (names.has('go.mod')) {
      found = true
      lang('Go')
    }
    const pom = await readHere('pom.xml')
    if (pom !== null) {
      found = true
      lang('Java')
      if (/spring-boot/i.test(pom)) fw('Spring Boot')
      if (/org\.openjfx/i.test(pom)) fw('JavaFX')
    }
    const gradle = (await readHere('build.gradle.kts')) ?? (await readHere('build.gradle')) ?? ''
    if (/org\.openjfx|javafx/i.test(gradle)) fw('JavaFX')
    if (/compose\.desktop|org\.jetbrains\.compose/i.test(gradle)) fw('Compose Desktop')
    if (names.has('build.gradle.kts')) {
      found = true
      lang('Kotlin')
    } else if (names.has('build.gradle')) {
      found = true
      lang('Java')
    }
    const composer = await readHere('composer.json')
    if (composer !== null) {
      found = true
      lang('PHP')
      if (/laravel\/framework/.test(composer)) fw('Laravel')
      if (/symfony\/framework-bundle/.test(composer)) fw('Symfony')
    }
    const pubspec = await readHere('pubspec.yaml')
    if (pubspec !== null) {
      found = true
      lang('Dart')
      if (/\bflutter:/.test(pubspec)) fw('Flutter')
    }
    const gemfile = await readHere('gemfile')
    if (gemfile !== null) {
      found = true
      lang('Ruby')
      if (/['"]rails['"]/.test(gemfile)) fw('Rails')
    }
    return found
  }

  // Prima la radice; se lì non c'è un progetto riconoscibile (es. soluzione in src\App\,
  // o frontend\ e backend\ separati) si guardano le sottocartelle, fino a due livelli.
  if (!(await scanDir('', entries))) {
    const dirs = entries.filter((e) => e.isDir && !DEEP_SKIP.test(e.name)).slice(0, 12)
    for (const d of dirs) {
      const inner = await src.list(d.name).catch(() => [])
      if (await scanDir(d.name, inner)) continue
      // Un livello in più per le cartelle contenitore (src\, apps\, services\…)
      if (!CONTAINER_DIRS.test(d.name)) continue
      for (const dd of inner.filter((e) => e.isDir && !DEEP_SKIP.test(e.name)).slice(0, 12)) {
        await scanDir(`${d.name}/${dd.name}`, await src.list(`${d.name}/${dd.name}`).catch(() => []))
      }
    }
  }

  // Linguaggi indicati dalla sorgente (es. statistiche di GitHub), se riconosciuti
  for (const l of info.languages ?? []) if (KNOWN_LANGUAGES.includes(l)) lang(l)

  // README e documento di architettura: aggiungono note, prerequisiti, passi, variabili
  let description = ''
  let merged = s
  const readmeEntry = entries.find((e) => !e.isDir && /^readme\.md$/i.test(e.name))
  if (readmeEntry) {
    const readme = (await read(readmeEntry.name)) ?? ''
    if (readme.length < 1_000_000) {
      const imp = parseStackMarkdown(readme)
      description = imp.description
      merged = mergeImportedStack(merged, imp, null).stack
    }
  }
  const archEntry = entries.find((e) => !e.isDir && /^(architettura|architecture)\.md$/i.test(e.name))
  if (archEntry) {
    const content = (await read(archEntry.name)) ?? ''
    if (content.length < 1_000_000)
      merged = mergeImportedStack(merged, parseStackMarkdown(content), { fileName: archEntry.name, content, importedAt: new Date().toISOString() }).stack
  }

  if (!merged.platforms.length) merged.platforms = platformsFor(merged.frameworks)
  // Configurazione sul PC: solo la preparazione, e si finisce aprendo il progetto nell'editor
  merged.steps = merged.steps.filter((x) => !isRunStep(x))
  const cut = merged.steps.findIndex(isEditorStep)
  if (cut >= 0) merged.steps = merged.steps.slice(0, cut + 1)
  else merged.steps.push({ id: newId('stp'), ...editorStep(firstProj) })
  // Prerequisiti: prima quelli precisi (dichiarati dai file), poi quelli deducibili non esclusi;
  // le versioni dichiarate (engines, requires-python, go.mod…) prevalgono su quelle del catalogo
  const hints = await versionHints(read)
  const has = (name: string) => merged.prerequisites.some((x) => (lookupPrerequisite(x.name)?.name ?? x.name) === name)
  for (const p of precise) {
    if (has(p.name)) continue
    const known = lookupPrerequisite(p.name)
    merged.prerequisites.push({ id: newId('pre'), name: known?.name ?? p.name, version: p.version, url: known?.url ?? '', check: known?.check ?? '' })
  }
  for (const k of suggestPrerequisites(merged, [...excluded])) {
    const known = KNOWN_PREREQUISITES.find((x) => x.name === k.name)!
    merged.prerequisites.push({ id: newId('pre'), name: known.name, version: hints[known.name] ?? known.version, url: known.url, check: known.check })
  }
  if (notes.length) merged.notes = [merged.notes, ...notes].filter(Boolean).join('\n\n')
  return { description, stack: merged, excluded: [...excluded] }
}
