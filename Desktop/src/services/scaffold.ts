/**
 * Configurazione iniziale dei progetti a partire dallo Stack:
 *  - copia dello stack di un progetto in un altro (modello per i progetti nuovi);
 *  - segnaposto {{name}} e {{slug}} nei comandi, nei link e nei file iniziali;
 *  - elenco dei file con cui creare la cartella del progetto sul PC
 *    (README, .env.example, script di configurazione e file iniziali dell'admin).
 * Le funzioni sono pure, tranne `writeProjectFolder` che scrive su disco.
 */
import { defineMessages } from '@/i18n'
import { newId } from './ids'
import { getFs } from './fs'
import { setupScriptWindows } from './analytics'
import { PLATFORM_LABEL, SETUP_STEP_LABEL, type Stack } from '@/types'

export interface ProjectVars {
  name: string
  slug: string
}

/** Nome adatto a cartelle e URL: minuscolo, senza accenti, parole separate da trattini. */
export function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'project'
}

export const varsFor = (name: string): ProjectVars => ({ name: name.trim(), slug: slugify(name) })

/** Sostituisce {{name}} e {{slug}} (spazi ammessi dentro le graffe). */
export const applyTokens = (text: string, v: ProjectVars) =>
  text.replace(/\{\{\s*(name|slug)\s*\}\}/g, (_, k: 'name' | 'slug') => v[k])

/** Applica `fn` a tutti i testi dello stack che possono contenere nomi o segnaposto. */
function mapTexts(stack: Stack, fn: (s: string) => string): Stack {
  return {
    ...stack,
    repoUrl: fn(stack.repoUrl),
    sourcePath: fn(stack.sourcePath),
    notes: fn(stack.notes),
    steps: stack.steps.map((s) => ({ ...s, title: fn(s.title), command: fn(s.command), cwd: fn(s.cwd), url: fn(s.url), notes: fn(s.notes) })),
    envVars: stack.envVars.map((v) => ({ ...v, example: fn(v.example), notes: fn(v.notes) })),
    files: stack.files.map((f) => ({ ...f, path: fn(f.path), content: fn(f.content) })),
  }
}

/** Lo stack con i segnaposto risolti per il progetto indicato. */
export const resolveStack = (stack: Stack, v: ProjectVars) => mapTexts(stack, (s) => applyTokens(s, v))

/** Lo stack ha qualcosa da copiare in un altro progetto? */
export const hasStack = (s: Stack) =>
  !!(s.platforms.length || s.languages.length || s.frameworks.length || s.notes || s.prerequisites.length || s.steps.length || s.envVars.length || s.files.length || s.doc)

/**
 * Copia lo stack di un progetto per usarlo in un altro: id nuovi, cartella
 * locale esclusa (è del progetto di origine), e il nome del progetto di origine
 * (anche nella forma slug) sostituito con quello del nuovo progetto.
 */
export function copyStack(source: Stack, fromName: string, toName: string): Stack {
  const from = varsFor(fromName)
  const to = varsFor(toName)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pairs = [from.name !== to.name ? [from.name, to.name] : null, from.slug !== to.slug ? [from.slug, to.slug] : null].filter(
    (p): p is string[] => !!p && !!p[0],
  )
  const rename = (s: string) => pairs.reduce((acc, [a, b]) => acc.replace(new RegExp(esc(a!), 'g'), b!), s)
  const copy = mapTexts(JSON.parse(JSON.stringify(source)) as Stack, rename)
  return {
    ...copy,
    sourcePath: '',
    prerequisites: copy.prerequisites.map((p) => ({ ...p, id: newId('pre') })),
    steps: copy.steps.map((s) => ({ ...s, id: newId('stp') })),
    files: copy.files.map((f) => ({ ...f, id: newId('tpl') })),
  }
}

/**
 * Percorso relativo sicuro dentro la cartella del progetto: separatori "/",
 * niente percorsi assoluti né "..". Restituisce null se non è accettabile.
 */
export function safeRelPath(path: string): string | null {
  const p = path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '')
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null
  const parts = p.split('/').filter(Boolean)
  if (!parts.length || parts.some((x) => x === '..' || x === '.')) return null
  return parts.join('/')
}

const M = defineMessages({
  it: {
    stack: 'Stack',
    type: 'Tipo',
    languages: 'Linguaggi',
    frameworks: 'Framework',
    repo: 'Repository',
    prerequisites: 'Prerequisiti',
    check: 'verifica con',
    download: 'download',
    setup: 'Configurazione',
    setupScript: (file: string) => `Su Windows i passi si possono eseguire in sequenza con \`${file}\` (doppio click).`,
    env: 'Variabili d’ambiente',
    envHint: 'Copia `.env.example` in `.env` e completa i valori.',
    variable: 'Variabile',
    example: 'Esempio',
    notes: 'Note',
    generated: 'Generato da Todo Doto.',
  },
  en: {
    stack: 'Stack',
    type: 'Type',
    languages: 'Languages',
    frameworks: 'Frameworks',
    repo: 'Repository',
    prerequisites: 'Prerequisites',
    check: 'check with',
    download: 'download',
    setup: 'Setup',
    setupScript: (file: string) => `On Windows the steps can be run in sequence with \`${file}\` (double-click).`,
    env: 'Environment variables',
    envHint: 'Copy `.env.example` to `.env` and fill in the values.',
    variable: 'Variable',
    example: 'Example',
    notes: 'Notes',
    generated: 'Generated by Todo Doto.',
  },
})

export interface ScaffoldFile {
  path: string
  content: string
}

/**
 * I file della cartella di un nuovo progetto: README.md con stack e procedura,
 * .env.example, script di configurazione per Windows e i file iniziali definiti
 * dall'admin (che hanno la precedenza se usano lo stesso percorso).
 */
export function scaffoldFiles(projectName: string, description: string, stack: Stack): ScaffoldFile[] {
  const v = varsFor(projectName)
  const s = resolveStack(stack, v)
  const scriptName = `setup-${v.slug}.cmd`
  const hasScript = s.prerequisites.length > 0 || s.steps.length > 0
  const L: string[] = [`# ${v.name}`, '']
  if (description.trim()) L.push(description.trim(), '')

  const tech: string[] = []
  if (s.platforms.length) tech.push(`- **${M.type}:** ${s.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}`)
  if (s.languages.length) tech.push(`- **${M.languages}:** ${s.languages.join(', ')}`)
  if (s.frameworks.length) tech.push(`- **${M.frameworks}:** ${s.frameworks.join(', ')}`)
  if (s.repoUrl) tech.push(`- **${M.repo}:** ${s.repoUrl}`)
  if (tech.length) L.push(`## ${M.stack}`, '', ...tech, '')
  if (s.notes.trim()) L.push(s.notes.trim(), '')

  if (s.prerequisites.length) {
    L.push(`## ${M.prerequisites}`, '')
    for (const p of s.prerequisites) {
      const extra = [p.check && `${M.check} \`${p.check}\``, p.url && `${M.download}: ${p.url}`].filter(Boolean).join(' · ')
      L.push(`- ${p.name}${p.version ? ` ${p.version}` : ''}${extra ? ` — ${extra}` : ''}`)
    }
    L.push('')
  }
  if (s.steps.length) {
    L.push(`## ${M.setup}`, '')
    s.steps.forEach((st, i) => {
      L.push(`${i + 1}. **${st.title}** (${SETUP_STEP_LABEL[st.kind]})`)
      if (st.notes.trim()) L.push(`   ${st.notes.trim()}`)
      if (st.kind === 'command' && st.command.trim()) L.push('', '   ```bat', ...(st.cwd ? [`   cd ${st.cwd}`] : []), ...st.command.split('\n').map((c) => `   ${c}`), '   ```')
      if (st.kind === 'link' && st.url) L.push(`   ${st.url}`)
      L.push('')
    })
    L.push(M.setupScript(scriptName), '')
  }
  if (s.envVars.length) {
    L.push(`## ${M.env}`, '', M.envHint, '', `| ${M.variable} | ${M.example} | ${M.notes} |`, '|---|---|---|')
    for (const e of s.envVars) L.push(`| \`${e.key}\` | ${e.example ? `\`${e.example}\`` : ''} | ${e.notes} |`)
    L.push('')
  }
  L.push('---', '', `_${M.generated}_`, '')

  const files = new Map<string, string>()
  files.set('README.md', L.join('\n'))
  if (s.envVars.length) files.set('.env.example', s.envVars.map((e) => (e.notes ? `# ${e.notes}\n` : '') + `${e.key}=${e.example}`).join('\n') + '\n')
  if (hasScript) files.set(scriptName, setupScriptWindows(v.name, s))
  // Documento di architettura importato nello Stack, con il suo nome
  const docPath = s.doc ? safeRelPath(s.doc.fileName) : null
  if (s.doc && docPath) files.set(docPath, s.doc.content)
  for (const f of s.files) {
    const p = safeRelPath(f.path)
    if (p) files.set(p, f.content)
  }
  return [...files].map(([path, content]) => ({ path, content }))
}

/**
 * Crea `<destinazione>/<slug>` con i file del progetto. Le cartelle intermedie
 * dei file iniziali vengono create; i file esistenti vengono sovrascritti.
 * Restituisce il percorso della cartella creata.
 */
export async function writeProjectFolder(dest: string, projectName: string, files: ScaffoldFile[]): Promise<string> {
  const fs = await getFs()
  return writeProjectFolderAt(await fs.join(dest, slugify(projectName)), files)
}

/** Scrive i file del progetto esattamente nella cartella `root` (creandola se serve). */
export async function writeProjectFolderAt(root: string, files: ScaffoldFile[]): Promise<string> {
  const fs = await getFs()
  await fs.mkdir(root)
  for (const f of files) {
    const parts = f.path.split('/')
    if (parts.length > 1) await fs.mkdir(await fs.join(root, ...parts.slice(0, -1)))
    await fs.writeTextAtomic(await fs.join(root, ...parts), f.content)
  }
  return root
}

/** La cartella `<destinazione>/<slug>` esiste già? */
export async function projectFolderExists(dest: string, projectName: string) {
  const fs = await getFs()
  return fs.exists(await fs.join(dest, slugify(projectName)))
}
