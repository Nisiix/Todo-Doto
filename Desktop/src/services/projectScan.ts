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
import { KNOWN_LANGUAGES, KNOWN_PREREQUISITES, suggestPrerequisites } from './prerequisites'
import { editorStep, isEditorStep, isRunStep, mergeImportedStack, parseStackMarkdown, platformsFor } from './stackDoc'
import { EMPTY_STACK, type SetupStep, type Stack } from '@/types'

export interface DetectedProject {
  /** Nome della cartella: diventa il nome del progetto. */
  name: string
  path: string
  /** File o cartelle che l'hanno fatto riconoscere (es. ".git", "package.json"). */
  markers: string[]
}

/** File e cartelle che indicano un progetto. */
const MARKER_FILES = [
  'package.json', 'cargo.toml', 'pyproject.toml', 'requirements.txt', 'setup.py', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'composer.json', 'pubspec.yaml', 'gemfile', 'readme.md', 'deno.json',
]
const MARKER_EXT = /\.(sln|csproj|vbproj|fsproj)$/i
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
 * hanno l'aspetto, esclusi i workspace di Project Goal Manager. Se nessuna
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

const M = defineMessages({
  it: {
    install: 'Installa le dipendenze',
    clone: 'Clona il repository',
    restore: 'Ripristina i pacchetti NuGet',
    pipInstall: 'Installa i pacchetti Python',
  },
  en: {
    install: 'Install the dependencies',
    clone: 'Clone the repository',
    restore: 'Restore the NuGet packages',
    pipInstall: 'Install the Python packages',
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
export async function detectStack(path: string): Promise<{ description: string; stack: Stack }> {
  const fs = await getFs()
  const source: ProjectSource = {
    list: () => fs.listDir(path).catch(() => []),
    read: async (name) => fs.readText(await fs.join(path, name)).catch(() => null),
    gitConfig: async () => fs.readText(await fs.join(path, '.git', 'config')).catch(() => ''),
  }
  return stackFromSource(source, { sourcePath: path })
}

/** Dove si leggono i file di un progetto: una cartella locale o un repository remoto (es. GitHub). */
export interface ProjectSource {
  /** File e cartelle della radice del progetto. */
  list(): Promise<{ name: string; isDir: boolean }[]>
  /** Contenuto di un file della radice (null se manca o non si legge). */
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
): Promise<{ description: string; stack: Stack }> {
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

  // JavaScript / TypeScript
  const pkgText = await read('package.json')
  if (pkgText) {
    try {
      const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      lang(deps.typescript || byName.has('tsconfig.json') ? 'TypeScript' : 'JavaScript')
      if (deps.vue) fw(/^\D*3/.test(deps.vue) ? 'Vue 3' : 'Vue')
      for (const name of Object.keys(deps)) for (const [re, f] of NPM_FRAMEWORKS) if (re.test(name)) fw(f)
      const pm = byName.has('pnpm-lock.yaml') ? 'pnpm' : byName.has('yarn.lock') ? 'yarn' : 'npm'
      step(M.install, pm === 'yarn' ? 'yarn' : `${pm} install`)
    } catch {
      /* package.json non valido: si ignora */
    }
  }
  // Rust / Tauri
  if (byName.get('src-tauri')?.isDir) {
    fw('Tauri')
    lang('Rust')
  }
  if (byName.has('cargo.toml')) lang('Rust')
  // .NET
  const projFile = entries.find((e) => !e.isDir && /\.(csproj|vbproj|fsproj)$/i.test(e.name))
  const slnFile = entries.find((e) => !e.isDir && /\.sln$/i.test(e.name))
  if (projFile || slnFile) {
    const ext = (projFile?.name ?? '').toLowerCase()
    lang(ext.endsWith('.vbproj') ? 'VB.NET' : ext.endsWith('.fsproj') ? 'F#' : 'C#')
    const proj = projFile ? ((await read(projFile.name)) ?? '') : ''
    if (/<UseWPF>\s*true/i.test(proj)) fw('WPF')
    if (/<UseWindowsForms>\s*true/i.test(proj)) fw('WinForms')
    if (/Microsoft\.NET\.Sdk\.Web/i.test(proj)) fw('ASP.NET Core')
    if (/<TargetFrameworkVersion>\s*v[1-4]/i.test(proj)) fw('.NET Framework')
    else fw('.NET')
    if (/<Project\s+Sdk=/i.test(proj)) step(M.restore, 'dotnet restore')
  }
  // Python
  const pyproject = await read('pyproject.toml')
  const requirements = await read('requirements.txt')
  if (pyproject !== null || requirements !== null || byName.has('setup.py')) {
    lang('Python')
    const text = `${pyproject ?? ''}\n${requirements ?? ''}`.toLowerCase()
    if (/\bdjango\b/.test(text)) fw('Django')
    if (/\bflask\b/.test(text)) fw('Flask')
    if (/\bfastapi\b/.test(text)) fw('FastAPI')
    if (requirements !== null) step(M.pipInstall, 'pip install -r requirements.txt')
  }
  // Altri ecosistemi
  if (byName.has('go.mod')) lang('Go')
  const pom = await read('pom.xml')
  if (pom !== null) {
    lang('Java')
    if (/spring-boot/i.test(pom)) fw('Spring Boot')
  }
  if (byName.has('build.gradle.kts')) lang('Kotlin')
  else if (byName.has('build.gradle')) lang('Java')
  const composer = await read('composer.json')
  if (composer !== null) {
    lang('PHP')
    if (/laravel\/framework/.test(composer)) fw('Laravel')
    if (/symfony\/framework-bundle/.test(composer)) fw('Symfony')
  }
  const pubspec = await read('pubspec.yaml')
  if (pubspec !== null) {
    lang('Dart')
    if (/\bflutter:/.test(pubspec)) fw('Flutter')
  }
  const gemfile = await read('gemfile')
  if (gemfile !== null) {
    lang('Ruby')
    if (/['"]rails['"]/.test(gemfile)) fw('Rails')
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
  else merged.steps.push({ id: newId('stp'), ...editorStep((slnFile ?? projFile)?.name) })
  for (const k of suggestPrerequisites(merged)) {
    const known = KNOWN_PREREQUISITES.find((x) => x.name === k.name)!
    merged.prerequisites.push({ id: newId('pre'), name: known.name, version: known.version, url: known.url, check: known.check })
  }
  return { description, stack: merged }
}
