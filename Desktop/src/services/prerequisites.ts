/**
 * Catalogo dei prerequisiti più comuni (strumenti da installare per lavorare a
 * un progetto). Serve a compilare in automatico i campi della sezione Stack:
 *  - scrivendo il nome di un prerequisito noto si completano versione, link
 *    per scaricarlo e comando di verifica (solo i campi ancora vuoti);
 *  - da linguaggi, framework e repository si deducono i prerequisiti necessari
 *    (es. TypeScript o Vue → Node.js; Tauri → Node.js, Rust, Build Tools).
 */
import type { Prerequisite, Stack } from '@/types'
import { newId } from './ids'

export interface KnownPrerequisite {
  name: string
  /** Altri modi di scriverlo (confronto senza maiuscole, spazi e punti). */
  aliases: string[]
  version: string
  url: string
  check: string
  /** Linguaggi, framework o piattaforme che lo richiedono. */
  neededBy: string[]
  /** Sistemi su cui serve (se manca: tutti). */
  os?: Array<'windows' | 'macos' | 'linux'>
  /**
   * Verifica dell'installazione per gli strumenti senza un comando di verifica
   * (es. Visual Studio): solo Windows; uscita diversa da 0 o output vuoto = non installato.
   */
  probe?: { command: string; version?: RegExp }
  /** Come leggere la versione nell'output del comando di verifica (se non è il primo numero). */
  versionPattern?: RegExp
  /**
   * Seconda verifica, solo Windows, se il comando non si trova: il percorso
   * d'installazione standard (programma installato ma non nel PATH) o un
   * comando alternativo (es. il launcher "py" di Python).
   */
  fallback?: string
  /** Spiegazione aggiunta quando manca (es. cosa NON basta al suo posto). */
  missingNote?: { it: string; en: string }
  /** Converte la versione letta in quella da confrontare (es. Visual Studio "10.0" → "2010"). */
  normalizeVersion?: (v: string) => string
}

/** Versione interna di Visual Studio → anno ("10.0" → "2010"; "2022" resta). */
const VS_YEARS: Record<number, number> = { 9: 2008, 10: 2010, 11: 2012, 12: 2013, 14: 2015, 15: 2017, 16: 2019, 17: 2022, 18: 2026 }
const vsYear = (v: string) => {
  const major = Number.parseInt(v, 10)
  return major >= 2000 ? String(major) : VS_YEARS[major] ? String(VS_YEARS[major]) : v
}

export const KNOWN_PREREQUISITES: KnownPrerequisite[] = [
  {
    name: 'Node.js',
    aliases: ['node', 'nodejs', 'npm'],
    version: '20+',
    url: 'https://nodejs.org',
    check: 'node -v',
    fallback: '"%ProgramFiles%\\nodejs\\node.exe" -v',
    neededBy: ['TypeScript', 'JavaScript', 'Vue', 'Vue 3', 'React', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Vite', 'Node.js', 'Express', 'NestJS', 'Electron', 'Tauri', 'Ionic', 'Capacitor', 'Tailwind CSS', 'React Native', 'Expo', 'Astro', 'Remix'],
  },
  { name: 'Git', aliases: ['git scm'], version: '', url: 'https://git-scm.com/downloads', check: 'git --version', neededBy: [], fallback: '"%ProgramFiles%\\Git\\cmd\\git.exe" --version' },
  { name: 'Rust', aliases: ['rustup', 'cargo', 'rustc'], version: 'stable', url: 'https://rustup.rs', check: 'cargo --version', neededBy: ['Rust', 'Tauri'], fallback: '"%USERPROFILE%\\.cargo\\bin\\cargo.exe" --version' },
  {
    name: 'Visual Studio Build Tools',
    aliases: ['build tools', 'vs build tools', 'msvc', 'visual c++ build tools'],
    version: '2022 (Desktop development with C++)',
    url: 'https://visualstudio.microsoft.com/visual-cpp-build-tools/',
    check: '',
    neededBy: ['Rust', 'Tauri', 'C++'],
    os: ['windows'],
    probe: { command: '"%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -latest -property catalog_productLineVersion' },
  },
  {
    name: '.NET SDK',
    aliases: ['dotnet', 'dotnet sdk', 'net sdk', '.net'],
    version: '8+',
    url: 'https://dotnet.microsoft.com/download',
    check: 'dotnet --version',
    neededBy: ['C#', 'F#', '.NET', 'ASP.NET', 'ASP.NET Core', 'Blazor', 'MAUI', '.NET MAUI'],
    fallback: '"%ProgramFiles%\\dotnet\\dotnet.exe" --version',
    missingNote: {
      it: 'Il .NET Framework incluso in Windows e i soli runtime .NET non bastano: serve il .NET SDK (comando dotnet).',
      en: 'The .NET Framework included in Windows and the .NET runtimes alone are not enough: the .NET SDK (dotnet command) is needed.',
    },
  },
  {
    name: 'Visual Studio',
    aliases: ['visual studio community', 'vs2022'],
    // Nessuna versione predefinita: quella giusta la dichiara la soluzione (.sln), es. 2010 per un progetto Express 2010
    version: '',
    url: 'https://visualstudio.microsoft.com/downloads/',
    check: '',
    neededBy: ['WPF', 'WinForms', 'Windows Forms', '.NET Framework', '.NET 4.0', 'VB.NET'],
    os: ['windows'],
    probe: { command: '"%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe" -latest -property catalog_productLineVersion' },
    // vswhere vede solo Visual Studio 2017 e successivi: per le versioni precedenti ed Express (2010…) il registro
    fallback: 'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\SxS\\VS7" 2>nul || reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VBExpress" 2>nul || reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VCSExpress" 2>nul || reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\WDExpress" 2>nul',
    normalizeVersion: vsYear,
  },
  {
    name: '.NET Framework',
    aliases: ['net framework', 'dotnet framework', '.net framework 4', 'framework .net'],
    version: '4.8',
    url: 'https://dotnet.microsoft.com/download/dotnet-framework',
    check: '',
    // Anche senza i file del progetto: un progetto .NET Framework (es. Visual Basic Express 2010) richiede il framework
    neededBy: ['.NET Framework', '.NET 4.0'],
    os: ['windows'],
    probe: { command: 'reg query "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" /v Version' },
  },
  {
    name: 'Visual Basic 6.0',
    aliases: ['vb6', 'visual basic 6', 'vb 6.0'],
    version: '',
    url: '',
    check: '',
    neededBy: ['Visual Basic 6'],
    os: ['windows'],
    probe: { command: 'dir /b "%ProgramFiles(x86)%\\Microsoft Visual Studio\\VB98\\VB6.EXE"' },
  },
  {
    name: 'CMake',
    aliases: ['cmake'],
    version: '',
    url: 'https://cmake.org/download/',
    check: 'cmake --version',
    neededBy: ['CMake'],
    fallback: '"%ProgramFiles%\\CMake\\bin\\cmake.exe" --version',
  },
  {
    name: 'Qt',
    aliases: ['qt5', 'qt6', 'qt creator', 'qt framework'],
    version: '',
    url: 'https://www.qt.io/download-qt-installer',
    check: 'qmake -v',
    // "QMake version 3.1 / Using Qt version 6.5.0": conta la versione di Qt
    versionPattern: /Using Qt version ([\d.]+)/i,
    neededBy: ['Qt'],
  },
  {
    name: 'WebView2 Runtime',
    aliases: ['webview2', 'edge webview2'],
    version: '',
    url: 'https://developer.microsoft.com/microsoft-edge/webview2/',
    check: '',
    neededBy: ['Tauri', 'Wails'],
    os: ['windows'],
    probe: { command: 'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv' },
  },
  { name: 'Wails CLI', aliases: ['wails'], version: '', url: 'https://wails.io/docs/gettingstarted/installation', check: 'wails version', neededBy: ['Wails'] },
  {
    name: 'GCC (MinGW-w64)',
    aliases: ['gcc', 'mingw', 'mingw-w64', 'tdm-gcc'],
    version: '',
    url: 'https://www.msys2.org/',
    check: 'gcc --version',
    neededBy: ['Fyne'],
  },
  {
    name: 'Delphi (RAD Studio)',
    aliases: ['delphi', 'rad studio', 'embarcadero delphi'],
    version: '',
    url: 'https://www.embarcadero.com/products/delphi',
    check: '',
    neededBy: ['Delphi'],
    os: ['windows'],
    probe: { command: 'reg query "HKCU\\SOFTWARE\\Embarcadero\\BDS"' },
  },
  {
    name: 'Lazarus',
    aliases: ['free pascal', 'fpc', 'lazarus ide'],
    version: '',
    url: 'https://www.lazarus-ide.org/',
    check: '',
    neededBy: ['Lazarus'],
    probe: { command: 'dir /b "C:\\lazarus\\lazarus.exe"' },
  },
  {
    name: 'Microsoft Access',
    aliases: ['access', 'ms access', 'msaccess'],
    version: '',
    url: 'https://www.microsoft.com/microsoft-365/access',
    check: '',
    neededBy: ['Microsoft Access'],
    os: ['windows'],
    probe: { command: 'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\MSACCESS.EXE" /ve' },
  },
  {
    name: 'Visual FoxPro 9',
    aliases: ['foxpro', 'visual foxpro', 'vfp'],
    version: '9',
    url: '',
    check: '',
    neededBy: ['Visual FoxPro'],
    os: ['windows'],
    probe: { command: 'dir /b "%ProgramFiles(x86)%\\Microsoft Visual FoxPro 9\\vfp9.exe" 2>nul || reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualFoxPro\\9.0" 2>nul' },
  },
  {
    name: 'PowerBuilder',
    aliases: ['appeon powerbuilder'],
    version: '',
    url: 'https://www.appeon.com/products/powerbuilder',
    check: '',
    neededBy: ['PowerBuilder'],
    os: ['windows'],
    probe: { command: 'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Appeon\\PowerBuilder" 2>nul || reg query "HKLM\\SOFTWARE\\WOW6432Node\\Sybase\\PowerBuilder" 2>nul' },
  },
  { name: 'Python', aliases: ['python3', 'py'], version: '3.11+', url: 'https://www.python.org/downloads/', check: 'python --version', neededBy: ['Python', 'Django', 'Flask', 'FastAPI'], fallback: 'py --version' },
  { name: 'Java JDK', aliases: ['java', 'jdk', 'openjdk', 'temurin'], version: '17+', url: 'https://adoptium.net', check: 'java -version', neededBy: ['Java', 'Kotlin', 'Spring', 'Spring Boot', 'Android'], fallback: '"%JAVA_HOME%\\bin\\java.exe" -version' },
  { name: 'Go', aliases: ['golang'], version: '', url: 'https://go.dev/dl/', check: 'go version', neededBy: ['Go'], fallback: '"%ProgramFiles%\\Go\\bin\\go.exe" version' },
  { name: 'PHP', aliases: ['php8'], version: '8.2+', url: 'https://www.php.net/downloads', check: 'php -v', neededBy: ['PHP', 'Laravel', 'Symfony', 'WordPress'] },
  { name: 'Composer', aliases: ['php composer'], version: '', url: 'https://getcomposer.org/download/', check: 'composer --version', neededBy: ['Laravel', 'Symfony'] },
  { name: 'Ruby', aliases: ['rbenv'], version: '', url: 'https://www.ruby-lang.org/en/downloads/', check: 'ruby -v', neededBy: ['Ruby', 'Rails', 'Ruby on Rails'] },
  { name: 'Flutter SDK', aliases: ['flutter'], version: 'stable', url: 'https://docs.flutter.dev/get-started/install', check: 'flutter --version', neededBy: ['Flutter', 'Dart'] },
  {
    name: 'Android Studio',
    aliases: ['android sdk'],
    version: '',
    url: 'https://developer.android.com/studio',
    check: '',
    neededBy: ['Android', 'Kotlin', 'Capacitor', 'Ionic', 'React Native', 'Flutter'],
    probe: { command: 'type "%ProgramFiles%\\Android\\Android Studio\\product-info.json"', version: /"version"\s*:\s*"([\d.]+)"/ },
  },
  { name: 'Xcode', aliases: ['xcode command line tools'], version: '', url: 'https://developer.apple.com/xcode/', check: 'xcodebuild -version', neededBy: ['Swift', 'iOS', 'SwiftUI'], os: ['macos'] },
  { name: 'Docker Desktop', aliases: ['docker'], version: '', url: 'https://www.docker.com/products/docker-desktop/', check: 'docker --version', neededBy: ['Docker', 'Docker Compose', 'Kubernetes'], fallback: '"%ProgramFiles%\\Docker\\Docker\\resources\\bin\\docker.exe" --version' },
  { name: 'PostgreSQL', aliases: ['postgres', 'psql'], version: '', url: 'https://www.postgresql.org/download/', check: 'psql --version', neededBy: ['PostgreSQL'] },
  { name: 'MySQL', aliases: ['mariadb'], version: '', url: 'https://dev.mysql.com/downloads/', check: 'mysql --version', neededBy: ['MySQL'] },
  { name: 'SQL Server', aliases: ['mssql', 'sql server express'], version: '', url: 'https://www.microsoft.com/sql-server/sql-server-downloads', check: 'sqlcmd -?', neededBy: ['SQL Server'] },
  { name: 'Supabase CLI', aliases: ['supabase'], version: '', url: 'https://supabase.com/docs/guides/cli', check: 'supabase --version', neededBy: ['Supabase'] },
  { name: 'pnpm', aliases: [], version: '', url: 'https://pnpm.io/installation', check: 'pnpm -v', neededBy: ['pnpm'] },
  { name: 'Yarn', aliases: [], version: '', url: 'https://yarnpkg.com/getting-started/install', check: 'yarn -v', neededBy: ['Yarn'] },
]

const key = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, '')

/** Prerequisito noto con questo nome (o alias), se esiste. */
export function lookupPrerequisite(name: string): KnownPrerequisite | null {
  const k = key(name)
  if (!k) return null
  return KNOWN_PREREQUISITES.find((p) => key(p.name) === k || p.aliases.some((a) => key(a) === k)) ?? null
}

/**
 * Completa i campi vuoti di un prerequisito se il nome è noto (versione, link,
 * comando di verifica); usa il nome canonico. Restituisce true se ha cambiato qualcosa.
 */
export function autofillPrerequisite(p: Pick<Prerequisite, 'name' | 'version' | 'url' | 'check'>): boolean {
  const known = lookupPrerequisite(p.name)
  if (!known) return false
  let changed = false
  const fill = (field: 'version' | 'url' | 'check') => {
    if (!p[field].trim() && known[field]) {
      p[field] = known[field]
      changed = true
    }
  }
  fill('version')
  fill('url')
  fill('check')
  if (p.name !== known.name) {
    p.name = known.name
    changed = true
  }
  return changed
}

/** Framework del .NET moderno (progetti "SDK"): servono il .NET SDK. */
const MODERN_DOTNET = ['.NET', 'ASP.NET Core', 'Blazor', '.NET MAUI', 'MAUI'].map(key)
/** Solo .NET Framework o Visual Basic 6, senza .NET moderno: si compila con Visual Studio, non con il .NET SDK. */
function isClassicDotnet(tech: Set<string>): boolean {
  return (tech.has(key('.NET Framework')) || tech.has(key('Visual Basic 6'))) && !MODERN_DOTNET.some((t) => tech.has(t))
}

/** Versione minima di Visual Studio per una versione di .NET Framework (es. 4.0 → 2010). */
export function vsForNetFramework(version: string): number | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim())
  if (!m) return null
  const v = Number(m[1]) * 100 + Number(m[2]) * 10 + Number(m[3] ?? 0)
  if (v >= 480) return 2019
  if (v >= 470) return 2017
  if (v >= 460) return 2015
  if (v >= 451) return 2013
  if (v >= 450) return 2012
  if (v >= 400) return 2010
  if (v >= 350) return 2008
  if (v >= 200) return 2005
  return null
}

export interface PrerequisiteFix {
  name: string
  /** Versione di prima ('' per uno da aggiungere). */
  from: string
  /** Nuova versione; null = da togliere. */
  to: string | null
  /** classic-dotnet: non serve; default-version: versione predefinita non dichiarata; missing: da aggiungere. */
  reason: 'classic-dotnet' | 'default-version' | 'missing'
  /** Per "missing": linguaggio o framework che lo richiede. */
  because?: string
}

/**
 * Revisione dei prerequisiti già salvati, anche senza la cartella del progetto
 * (es. stack creato prima del riconoscimento preciso):
 *  - mancano quelli che linguaggi, framework e passi richiedono (es. il .NET
 *    Framework in un progetto .NET Framework, Git con un passo "git clone");
 *  - in un progetto solo .NET Framework il .NET SDK non serve, e Visual Studio
 *    "2022" (il vecchio valore predefinito) diventa la versione minima per il
 *    .NET Framework dichiarato dai file (es. "4.0+" → 2010+), o nessuna versione.
 */
export function reviewPrerequisites(stack: Pick<Stack, 'languages' | 'frameworks' | 'repoUrl' | 'prerequisites'> & { steps?: Stack['steps'] }): PrerequisiteFix[] {
  const tech = [...stack.languages, ...stack.frameworks]
  const fixes: PrerequisiteFix[] = suggestPrerequisites(stack).map((k) => ({
    name: k.name,
    from: '',
    to: k.version,
    reason: 'missing',
    because: k.name === 'Git' ? 'git' : tech.find((t) => k.neededBy.some((n) => key(n) === key(t))),
  }))
  if (!isClassicDotnet(new Set(tech.map(key)))) return fixes
  const canon = (n: string) => lookupPrerequisite(n)?.name ?? n
  // Solo la versione dichiarata dai file ("4.0+"), non quella proposta dal catalogo
  const fx = stack.prerequisites.find((p) => canon(p.name) === '.NET Framework' && p.version.includes('+'))
  for (const p of stack.prerequisites) {
    const name = canon(p.name)
    if (name === '.NET SDK') fixes.push({ name: p.name, from: p.version, to: null, reason: 'classic-dotnet' })
    else if (name === 'Visual Studio' && /^\s*2022\s*$/.test(p.version)) {
      const year = fx ? vsForNetFramework(fx.version) : null
      fixes.push({ name: p.name, from: p.version, to: year ? `${year}+` : '', reason: 'default-version' })
    }
  }
  return fixes
}

/** Applica le correzioni della revisione (quelli da aggiungere con link e verifica del catalogo). */
export function applyPrerequisiteFixes<T extends Pick<Stack, 'prerequisites'>>(stack: T, fixes: PrerequisiteFix[]): T {
  const byName = new Map(fixes.filter((f) => f.reason !== 'missing').map((f) => [f.name, f]))
  const prerequisites = stack.prerequisites
    .filter((p) => byName.get(p.name)?.to !== null)
    .map((p) => {
      const f = byName.get(p.name)
      return f && f.to !== null ? { ...p, version: f.to } : p
    })
  for (const f of fixes.filter((x) => x.reason === 'missing')) {
    const k = lookupPrerequisite(f.name)
    prerequisites.push({ id: newId('pre'), name: k?.name ?? f.name, version: f.to ?? '', url: k?.url ?? '', check: k?.check ?? '' })
  }
  return { ...stack, prerequisites }
}

/**
 * Prerequisiti deducibili dallo stack (linguaggi, framework, repository git)
 * che non sono ancora nell'elenco, nell'ordine del catalogo.
 */
export function suggestPrerequisites(
  stack: Pick<Stack, 'languages' | 'frameworks' | 'repoUrl' | 'prerequisites'> & { steps?: Stack['steps'] },
  exclude: string[] = [],
): KnownPrerequisite[] {
  const tech = new Set([...stack.languages, ...stack.frameworks].map(key))
  const present = new Set(stack.prerequisites.map((p) => lookupPrerequisite(p.name)?.name ?? p.name).map(key))
  // Git: repository git indicato, o un passo che usa git (es. "git clone")
  const usesGit =
    /git|\.git$|github|gitlab|bitbucket|azure\s*devops/i.test(stack.repoUrl) || !!stack.steps?.some((x) => x.kind === 'command' && /(^|[\s&|;])git\s+\w/m.test(x.command))
  const classic = isClassicDotnet(tech)
  return KNOWN_PREREQUISITES.filter((k) => {
    if (present.has(key(k.name)) || exclude.includes(k.name)) return false
    if (k.name === 'Git') return usesGit
    // Progetto .NET Framework (o VB6) senza .NET moderno: il .NET SDK non serve, anche se c'è C# o VB.NET
    if (k.name === '.NET SDK' && classic) return false
    return k.neededBy.some((t) => tech.has(key(t)))
  })
}

/** Nomi noti di linguaggi e framework, per riconoscerli in un documento. */
export const KNOWN_LANGUAGES = ['TypeScript', 'JavaScript', 'C#', 'F#', 'VB.NET', 'Visual Basic 6', 'Rust', 'Python', 'Java', 'Kotlin', 'Swift', 'Dart', 'Go', 'PHP', 'Ruby', 'C++', 'SQL', 'HTML', 'CSS']
export const KNOWN_FRAMEWORKS = [
  'Vue 3', 'Vue', 'React', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Astro', 'Vite', 'Tailwind CSS', 'Pinia', 'Node.js', 'Express', 'NestJS',
  'Tauri', 'Electron', 'Ionic', 'Capacitor', 'React Native', 'Expo', 'Flutter', '.NET', 'ASP.NET Core', 'Blazor', 'WPF', 'WinForms', '.NET MAUI',
  'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Laravel', 'Symfony', 'Rails', 'Supabase', 'Firebase', 'PostgreSQL', 'MySQL', 'SQL Server',
  'MongoDB', 'Redis', 'Docker', 'Playwright', 'Vitest', 'Jest',
]
