/**
 * Catalogo dei prerequisiti più comuni (strumenti da installare per lavorare a
 * un progetto). Serve a compilare in automatico i campi della sezione Stack:
 *  - scrivendo il nome di un prerequisito noto si completano versione, link
 *    per scaricarlo e comando di verifica (solo i campi ancora vuoti);
 *  - da linguaggi, framework e repository si deducono i prerequisiti necessari
 *    (es. TypeScript o Vue → Node.js; Tauri → Node.js, Rust, Build Tools).
 */
import type { Prerequisite, Stack } from '@/types'

export interface KnownPrerequisite {
  name: string
  /** Altri modi di scriverlo (confronto senza maiuscole, spazi e punti). */
  aliases: string[]
  version: string
  url: string
  check: string
  /** Linguaggi, framework o piattaforme che lo richiedono. */
  neededBy: string[]
}

export const KNOWN_PREREQUISITES: KnownPrerequisite[] = [
  {
    name: 'Node.js',
    aliases: ['node', 'nodejs', 'npm'],
    version: '20+',
    url: 'https://nodejs.org',
    check: 'node -v',
    neededBy: ['TypeScript', 'JavaScript', 'Vue', 'Vue 3', 'React', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Vite', 'Node.js', 'Express', 'NestJS', 'Electron', 'Tauri', 'Ionic', 'Capacitor', 'Tailwind CSS', 'React Native', 'Expo', 'Astro', 'Remix'],
  },
  { name: 'Git', aliases: ['git scm'], version: '', url: 'https://git-scm.com/downloads', check: 'git --version', neededBy: [] },
  { name: 'Rust', aliases: ['rustup', 'cargo', 'rustc'], version: 'stable', url: 'https://rustup.rs', check: 'cargo --version', neededBy: ['Rust', 'Tauri'] },
  {
    name: 'Visual Studio Build Tools',
    aliases: ['build tools', 'vs build tools', 'msvc', 'visual c++ build tools'],
    version: '2022 (Desktop development with C++)',
    url: 'https://visualstudio.microsoft.com/visual-cpp-build-tools/',
    check: '',
    neededBy: ['Rust', 'Tauri', 'C++'],
  },
  {
    name: '.NET SDK',
    aliases: ['dotnet', 'dotnet sdk', 'net sdk', '.net'],
    version: '8+',
    url: 'https://dotnet.microsoft.com/download',
    check: 'dotnet --version',
    neededBy: ['C#', 'F#', '.NET', 'ASP.NET', 'ASP.NET Core', 'Blazor', 'MAUI', '.NET MAUI'],
  },
  {
    name: 'Visual Studio',
    aliases: ['visual studio community', 'vs2022'],
    version: '2022',
    url: 'https://visualstudio.microsoft.com/downloads/',
    check: '',
    neededBy: ['WPF', 'WinForms', 'Windows Forms', '.NET Framework', '.NET 4.0', 'VB.NET'],
  },
  { name: 'Python', aliases: ['python3', 'py'], version: '3.11+', url: 'https://www.python.org/downloads/', check: 'python --version', neededBy: ['Python', 'Django', 'Flask', 'FastAPI'] },
  { name: 'Java JDK', aliases: ['java', 'jdk', 'openjdk', 'temurin'], version: '17+', url: 'https://adoptium.net', check: 'java -version', neededBy: ['Java', 'Kotlin', 'Spring', 'Spring Boot', 'Android'] },
  { name: 'Go', aliases: ['golang'], version: '', url: 'https://go.dev/dl/', check: 'go version', neededBy: ['Go'] },
  { name: 'PHP', aliases: ['php8'], version: '8.2+', url: 'https://www.php.net/downloads', check: 'php -v', neededBy: ['PHP', 'Laravel', 'Symfony', 'WordPress'] },
  { name: 'Composer', aliases: ['php composer'], version: '', url: 'https://getcomposer.org/download/', check: 'composer --version', neededBy: ['Laravel', 'Symfony'] },
  { name: 'Ruby', aliases: ['rbenv'], version: '', url: 'https://www.ruby-lang.org/en/downloads/', check: 'ruby -v', neededBy: ['Ruby', 'Rails', 'Ruby on Rails'] },
  { name: 'Flutter SDK', aliases: ['flutter'], version: 'stable', url: 'https://docs.flutter.dev/get-started/install', check: 'flutter --version', neededBy: ['Flutter', 'Dart'] },
  { name: 'Android Studio', aliases: ['android sdk'], version: '', url: 'https://developer.android.com/studio', check: '', neededBy: ['Android', 'Kotlin', 'Capacitor', 'Ionic', 'React Native', 'Flutter'] },
  { name: 'Xcode', aliases: ['xcode command line tools'], version: '', url: 'https://developer.apple.com/xcode/', check: 'xcodebuild -version', neededBy: ['Swift', 'iOS', 'SwiftUI'] },
  { name: 'Docker Desktop', aliases: ['docker'], version: '', url: 'https://www.docker.com/products/docker-desktop/', check: 'docker --version', neededBy: ['Docker', 'Docker Compose', 'Kubernetes'] },
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

/**
 * Prerequisiti deducibili dallo stack (linguaggi, framework, repository git)
 * che non sono ancora nell'elenco, nell'ordine del catalogo.
 */
export function suggestPrerequisites(stack: Pick<Stack, 'languages' | 'frameworks' | 'repoUrl' | 'prerequisites'>): KnownPrerequisite[] {
  const tech = new Set([...stack.languages, ...stack.frameworks].map(key))
  const present = new Set(stack.prerequisites.map((p) => lookupPrerequisite(p.name)?.name ?? p.name).map(key))
  const usesGit = /git|\.git$|github|gitlab|bitbucket|azure\s*devops/i.test(stack.repoUrl)
  return KNOWN_PREREQUISITES.filter((k) => {
    if (present.has(key(k.name))) return false
    if (k.name === 'Git') return usesGit
    return k.neededBy.some((t) => tech.has(key(t)))
  })
}

/** Nomi noti di linguaggi e framework, per riconoscerli in un documento. */
export const KNOWN_LANGUAGES = ['TypeScript', 'JavaScript', 'C#', 'F#', 'VB.NET', 'Rust', 'Python', 'Java', 'Kotlin', 'Swift', 'Dart', 'Go', 'PHP', 'Ruby', 'C++', 'SQL', 'HTML', 'CSS']
export const KNOWN_FRAMEWORKS = [
  'Vue 3', 'Vue', 'React', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Astro', 'Vite', 'Tailwind CSS', 'Pinia', 'Node.js', 'Express', 'NestJS',
  'Tauri', 'Electron', 'Ionic', 'Capacitor', 'React Native', 'Expo', 'Flutter', '.NET', 'ASP.NET Core', 'Blazor', 'WPF', 'WinForms', '.NET MAUI',
  'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Laravel', 'Symfony', 'Rails', 'Supabase', 'Firebase', 'PostgreSQL', 'MySQL', 'SQL Server',
  'MongoDB', 'Redis', 'Docker', 'Playwright', 'Vitest', 'Jest',
]
