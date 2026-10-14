/**
 * Importazione di un documento di architettura in Markdown (README,
 * ARCHITETTURA.md, …) nella sezione Stack: se ne ricava quanto più possibile
 * (tipo di applicazione, linguaggi, framework, repository, note, prerequisiti,
 * passi di configurazione con i comandi, variabili d'ambiente) e lo si unisce
 * allo stack esistente senza cancellare nulla. Funzioni pure, nessun I/O.
 *
 * Riconosce le sezioni dal titolo (in italiano e in inglese), le righe
 * "Chiave: valori" (es. "**Linguaggi:** TypeScript, SQL"), elenchi, tabelle e
 * blocchi di codice. Il README generato da "Crea cartella del progetto" si
 * reimporta senza perdite.
 */
import { newId } from './ids'
import { autofillPrerequisite, KNOWN_FRAMEWORKS, KNOWN_LANGUAGES, lookupPrerequisite } from './prerequisites'
import type { EnvVar, Platform, Prerequisite, SetupStep, Stack, StackDoc } from '@/types'

export interface ImportedStack {
  title: string
  /** Primo paragrafo del documento (prima delle sezioni): una descrizione breve. */
  description: string
  platforms: Platform[]
  languages: string[]
  frameworks: string[]
  repoUrl: string
  notes: string
  prerequisites: Omit<Prerequisite, 'id'>[]
  steps: Omit<SetupStep, 'id'>[]
  envVars: EnvVar[]
}

type Kind = 'prereq' | 'steps' | 'env' | 'tech' | 'other'
interface Section {
  title: string
  kind: Kind
  lines: string[]
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const FENCE = /^\s*(```|~~~)/
const LIST = /^(\s*)(?:\d+[.)]|[-*+])\s+(.*)$/
const URL_RE = /https?:\/\/[^\s)<>`'"]+/
const ENV_KEY = /^[A-Z][A-Z0-9_]{1,}$/

function classify(title: string): Kind {
  const t = fold(title)
  if (/variabil|environment|\benv\b|\.env|dotenv/.test(t)) return 'env'
  if (/prerequisit|requisit|requirement|dipendenz|occorrente|software necessario|prima di (iniziare|cominciare)|before you (begin|start)|what you need/.test(t)) return 'prereq'
  if (/setup|install|configura|getting started|avvio|quick ?start|come (iniziare|avviare)|passi|procedura|build|sviluppo|development|esecuzione|how to run|running/.test(t)) return 'steps'
  if (/stack|tecnolog|technolog|architett|architect|\btech\b|panoramica|overview/.test(t)) return 'tech'
  return 'other'
}

/** Testo senza markup: link → testo, grassetto/corsivo e codice in linea → testo. */
const plain = (s: string) =>
  s
    .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/\*\*|__|(?<!\w)[*_](?!\s)|`/g, '')
    .trim()

function sections(md: string): { title: string; preamble: string[]; list: Section[] } {
  const list: Section[] = []
  const preamble: string[] = []
  let title = ''
  let cur: Section | null = null
  let inCode = false
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) inCode = !inCode
    const h = !inCode && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) {
      if (h[1]!.length === 1 && !title) {
        title = plain(h[2]!)
        continue
      }
      cur = { title: plain(h[2]!), kind: classify(h[2]!), lines: [] }
      list.push(cur)
      continue
    }
    ;(cur ? cur.lines : preamble).push(line)
  }
  return { title, preamble, list }
}

/** Blocchi di testo: paragrafi, elementi di elenco, righe di tabella, codice. */
type Block = { type: 'para'; text: string } | { type: 'item'; text: string; indent: number } | { type: 'row'; cells: string[] } | { type: 'code'; lang: string; lines: string[] }

function blocks(lines: string[]): Block[] {
  const out: Block[] = []
  let code: { lang: string; lines: string[]; indent: number } | null = null
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'para', text: para.join(' ').trim() })
    para = []
  }
  for (const raw of lines) {
    if (code) {
      if (FENCE.test(raw)) {
        out.push({ type: 'code', lang: code.lang, lines: code.lines })
        code = null
      } else code.lines.push(raw.slice(Math.min(code.indent, raw.length - raw.trimStart().length)))
      continue
    }
    const fence = /^(\s*)(```|~~~)\s*([\w-]*)/.exec(raw)
    if (fence) {
      flush()
      code = { lang: fence[3]!.toLowerCase(), lines: [], indent: fence[1]!.length }
      continue
    }
    if (!raw.trim()) {
      flush()
      continue
    }
    if (/^\s*\|/.test(raw)) {
      flush()
      if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(raw)) out.push({ type: 'row', cells: raw.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()) })
      continue
    }
    const item = LIST.exec(raw)
    if (item) {
      flush()
      out.push({ type: 'item', text: item[2]!, indent: item[1]!.length })
      continue
    }
    if (/^\s{2,}\S/.test(raw) && out.length && !para.length) {
      // testo rientrato dopo un elemento di elenco: ne fa parte
      out.push({ type: 'para', text: '  ' + raw.trim() })
      continue
    }
    para.push(raw.trim())
  }
  flush()
  if (code) out.push({ type: 'code', lang: code.lang, lines: code.lines })
  return out
}

const splitValues = (s: string) =>
  plain(s)
    .split(/\s*(?:,|;|\/|\be\b|\band\b|·)\s*/)
    .map((x) => x.replace(/\.$/, '').trim())
    .filter(Boolean)

const PLATFORM_WORDS: [RegExp, Platform][] = [
  [/\bweb\b|sito|website|browser|pwa/i, 'web'],
  [/desktop|windows app|applicazione windows/i, 'desktop'],
  [/mobile|android|\bios\b|smartphone|app mobile/i, 'mobile'],
  [/backend|back-end|\bapi\b|server|servizi|services|microservi/i, 'backend'],
]

/** Valore di una riga "Chiave: valore" (elenco, paragrafo o tabella a due colonne). */
function keyValues(bs: Block[]): Map<string, string> {
  const kv = new Map<string, string>()
  const put = (k: string, v: string) => {
    const key = fold(plain(k))
    if (!kv.has(key) && v.trim()) kv.set(key, v.trim())
  }
  for (const b of bs) {
    if (b.type === 'row' && b.cells.length === 2) put(b.cells[0]!, b.cells[1]!)
    if (b.type === 'item' || b.type === 'para') {
      const m = /^\s*\**\s*([^:*]{2,30}?)\s*\**\s*:\s*\**\s*(.+)$/.exec(b.text)
      if (m) put(m[1]!, m[2]!)
    }
  }
  return kv
}
const findKey = (kv: Map<string, string>, re: RegExp) => [...kv].find(([k]) => re.test(k))?.[1]

/** Nomi noti citati nel testo (fuori dal codice), riconosciuti come parole intere. */
function scanKnown(text: string, names: string[]): string[] {
  const found: string[] = []
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(?<![\\w#+.])${esc}(?![\\w#+])`).test(text)) found.push(n)
  }
  // "Vue" è già compreso in "Vue 3"
  return found.filter((n) => !found.some((o) => o !== n && o.startsWith(n + ' ')))
}

function parsePrerequisite(text: string): Omit<Prerequisite, 'id'> | null {
  const url = (/\]\((https?:[^)]+)\)/.exec(text) ?? URL_RE.exec(text))?.[1] ?? URL_RE.exec(text)?.[0] ?? ''
  const check = /`([^`]+)`/.exec(text)?.[1]?.trim() ?? ''
  let rest = plain(text.replace(/`[^`]*`/g, '').replace(URL_RE, ''))
  rest = rest.split(/\s+[—–]\s+|\s+-\s+|\s*\(|:\s|,\s/)[0]!.trim()
  const v = /^(.+?)\s+(v?\d[\w.]*\+?|LTS|stable|latest)$/i.exec(rest)
  const p = { name: (v ? v[1]! : rest).trim(), version: v ? v[2]! : '', url, check }
  if (!p.name || p.name.length > 60) return null
  autofillPrerequisite(p)
  return p
}

const PROMPT = /^\s*(?:\$|>|PS[^>]*>|C:\\[^>]*>)\s+/
const COMMENT = /^\s*(?:#|rem\s|::|\/\/)/i
const KIND_SUFFIX = /\s*\((?:comando|command|operazione manuale|manual step|apri link|open link)\)\s*$/i

function parseSteps(bs: Block[]): Omit<SetupStep, 'id'>[] {
  const steps: Omit<SetupStep, 'id'>[] = []
  let cur: (Omit<SetupStep, 'id'> & { inline: string }) | null = null
  const close = () => {
    if (!cur) return
    if (!cur.command && cur.inline && /\s|^-/.test(cur.inline)) {
      cur.kind = 'command'
      cur.command = cur.inline
    }
    if (cur.kind !== 'command' && !cur.url) {
      const u = URL_RE.exec(cur.title + ' ' + cur.notes)?.[0]
      if (u) {
        cur.kind = 'link'
        cur.url = u
        if (cur.notes.trim() === u) cur.notes = '' // la riga col solo link non è una nota
      }
    }
    const { inline: _inline, ...step } = cur
    steps.push(step)
    cur = null
  }
  for (const b of bs) {
    if (b.type === 'item' && b.indent < 2) {
      close()
      cur = { title: plain(b.text).replace(KIND_SUFFIX, '').replace(/[:：]$/, '').trim(), kind: 'manual', command: '', cwd: '', url: '', notes: '', inline: /`([^`]+)`/.exec(b.text)?.[1] ?? '' }
    } else if (b.type === 'code') {
      // Blocchi di configurazione (variabili, JSON, YAML…) non sono comandi da eseguire
      if (/^(env|dotenv|ini|properties|json|jsonc|ya?ml|toml|xml)$/.test(b.lang)) continue
      let lines = b.lines.map((l) => l.replace(PROMPT, '')).filter((l) => l.trim() && !COMMENT.test(l))
      if (!lines.length) continue
      let cwd = ''
      const cd = /^\s*cd\s+(?:\/d\s+)?["']?([^"']+?)["']?\s*$/i.exec(lines[0]!)
      if (cd && lines.length > 1) {
        cwd = cd[1]!
        lines = lines.slice(1)
      }
      if (!cur || cur.command) {
        close()
        cur = { title: lines[0]!.trim().slice(0, 60), kind: 'manual', command: '', cwd: '', url: '', notes: '', inline: '' }
      }
      cur.kind = 'command'
      cur.command = lines.map((l) => l.trim()).join('\n')
      cur.cwd = cwd
    } else if ((b.type === 'para' && b.text.startsWith('  ')) || (b.type === 'item' && b.indent >= 2)) {
      if (cur) cur.notes = [cur.notes, plain(b.text)].filter(Boolean).join(' ')
    } else if (b.type === 'para') close()
  }
  close()
  return steps.filter((s) => s.title)
}

function parseEnv(bs: Block[], all: boolean): EnvVar[] {
  const out: EnvVar[] = []
  const add = (key: string, example: string, notes: string) => {
    const k = key.replace(/`/g, '').trim()
    if (ENV_KEY.test(k) && !out.some((e) => e.key === k)) out.push({ key: k, example: example.replace(/`/g, '').trim(), notes: plain(notes) })
  }
  for (const b of bs) {
    if (b.type === 'code' && (all || /^(env|dotenv|ini|properties|bash|sh|shell)?$/.test(b.lang))) {
      if (!all && b.lang === '' && !b.lines.some((l) => /^[A-Z][A-Z0-9_]+=/.test(l.trim()))) continue
      let comment = ''
      for (const l of b.lines) {
        const c = /^\s*#\s*(.+)$/.exec(l)
        if (c) {
          comment = c[1]!
          continue
        }
        const kv = /^\s*(?:export\s+|set\s+)?([A-Z][A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)
        if (kv) add(kv[1]!, kv[2]!.replace(/^["']|["']$/g, ''), comment)
        comment = ''
      }
    }
    if (!all) continue
    if (b.type === 'row' && b.cells.length >= 1) add(b.cells[0]!, b.cells[1] ?? '', b.cells.slice(2).join(' '))
    if (b.type === 'item') {
      const m = /^`?([A-Z][A-Z0-9_]+)`?\s*(?:=\s*`?([^`\s]*)`?)?\s*(?:[:—–-]\s*(.*))?$/.exec(b.text.trim())
      if (m) add(m[1]!, m[2] ?? '', m[3] ?? '')
    }
  }
  return out
}

/** Tipo di applicazione deducibile dai framework (es. Tauri → desktop, Vue → web, Express → backend). */
export function platformsFor(frameworks: string[]): Platform[] {
  const t = new Set(frameworks.map(fold))
  const out: Platform[] = []
  if (['tauri', 'electron', 'wpf', 'winforms', '.net maui'].some((x) => t.has(x))) out.push('desktop')
  if (['vue 3', 'vue', 'react', 'angular', 'svelte', 'next.js', 'nuxt', 'astro'].some((x) => t.has(x)) && !out.includes('desktop')) out.push('web')
  if (['ionic', 'capacitor', 'react native', 'expo', 'flutter'].some((x) => t.has(x))) out.push('mobile')
  if (['express', 'nestjs', 'django', 'flask', 'fastapi', 'spring boot', 'asp.net core', 'laravel', 'symfony'].some((x) => t.has(x))) out.push('backend')
  return out
}

/** Ricava lo stack da un documento Markdown. */
export function parseStackMarkdown(md: string): ImportedStack {
  const { title, preamble, list } = sections(md)
  const all = [{ title: '', kind: 'other' as Kind, lines: preamble }, ...list]
  const blocksOf = (s: Section) => blocks(s.lines)
  const allBlocks = all.flatMap(blocksOf)
  const kv = keyValues(allBlocks)
  const proseText = allBlocks
    .filter((b) => b.type !== 'code')
    .map((b) => (b.type === 'row' ? b.cells.join(' ') : b.text))
    .join('\n')

  const imp: ImportedStack = { title, description: '', platforms: [], languages: [], frameworks: [], repoUrl: '', notes: '', prerequisites: [], steps: [], envVars: [] }

  // Tipo, linguaggi, framework: dalle righe "Chiave: valori", altrimenti dai nomi noti citati nel testo
  const typeLine = findKey(kv, /^(tipo|type|piattaform|platform)/)
  if (typeLine) for (const [re, p] of PLATFORM_WORDS) if (re.test(typeLine) && !imp.platforms.includes(p)) imp.platforms.push(p)
  const langLine = findKey(kv, /^(linguagg|language)/)
  imp.languages = langLine ? splitValues(langLine) : scanKnown(proseText, KNOWN_LANGUAGES.filter((l) => !['HTML', 'CSS', 'Go'].includes(l)))
  const fwLine = findKey(kv, /^(framework|librer|librar)/)
  imp.frameworks = fwLine ? splitValues(fwLine) : scanKnown(proseText, KNOWN_FRAMEWORKS)
  if (!typeLine) imp.platforms = platformsFor(imp.frameworks)

  // Repository: riga esplicita, poi un URL di hosting git, poi un "git clone"
  const repoLine = findKey(kv, /^(repository|repo\b|sorgent|source)/)
  const codeText = allBlocks.filter((b) => b.type === 'code').flatMap((b) => (b.type === 'code' ? b.lines : [])).join('\n')
  imp.repoUrl =
    (repoLine && (URL_RE.exec(repoLine)?.[0] ?? plain(repoLine))) ||
    URL_RE.exec(proseText.split('\n').filter((l) => /github\.com|gitlab|bitbucket|dev\.azure\.com|\.git\b/i.test(l)).join(' '))?.[0] ||
    /git clone\s+(\S+)/.exec(codeText)?.[1] ||
    ''
  imp.repoUrl = imp.repoUrl.replace(/\.git$/, '').replace(/[.,;]$/, '')

  // Note: paragrafi delle sezioni di architettura, altrimenti il primo paragrafo del documento
  const paras = (secs: Section[]) =>
    secs
      .flatMap(blocksOf)
      .filter((b): b is { type: 'para'; text: string } => b.type === 'para' && !b.text.startsWith('  ') && !/^\s*\**[^:]{2,30}:\s/.test(b.text) && !/^_.*_$/.test(b.text))
      .map((b) => plain(b.text))
  const techParas = paras(list.filter((s) => s.kind === 'tech'))
  const intro = paras([all[0]!])
  imp.description = (intro[0] ?? '').slice(0, 300)
  imp.notes = (techParas.length ? techParas : intro.slice(0, 1)).join('\n\n').slice(0, 1200)

  // Prerequisiti: elementi di elenco e righe di tabella delle sezioni dei prerequisiti
  for (const s of list.filter((x) => x.kind === 'prereq')) {
    for (const b of blocksOf(s)) {
      // Nelle tabelle la seconda colonna è spesso la versione: "| Node.js | 20+ |"
      const rowText = (cells: string[]) =>
        /^(v?\d[\w.]*\+?|LTS|stable|latest)$/i.test(plain(cells[1] ?? '')) ? [`${cells[0]} ${plain(cells[1]!)}`, ...cells.slice(2)].join(' — ') : cells.join(' — ')
      const text = b.type === 'item' && b.indent < 2 ? b.text : b.type === 'row' ? rowText(b.cells) : null
      if (!text || (b.type === 'row' && /^(nome|name|strumento|tool|software)$/i.test(plain(b.cells[0]!)))) continue
      const p = parsePrerequisite(text)
      const canon = (n: string) => fold(lookupPrerequisite(n)?.name ?? n)
      if (p && !imp.prerequisites.some((x) => canon(x.name) === canon(p.name))) imp.prerequisites.push(p)
    }
  }

  // Passi: dalle sezioni di setup/installazione
  imp.steps = list.filter((s) => s.kind === 'steps').flatMap((s) => parseSteps(blocksOf(s)))

  // Variabili d'ambiente: sezioni dedicate, più i blocchi .env ovunque
  const envSections = list.filter((s) => s.kind === 'env')
  imp.envVars = parseEnv(envSections.flatMap(blocksOf), true)
  for (const e of parseEnv(allBlocks, false)) if (!imp.envVars.some((x) => x.key === e.key)) imp.envVars.push(e)

  return imp
}

export interface ImportCounts {
  platforms: number
  languages: number
  frameworks: number
  prerequisites: number
  steps: number
  envVars: number
  repo: boolean
  notes: boolean
}

/**
 * Unisce quanto importato allo stack senza cancellare nulla: aggiunge solo
 * ciò che manca (stessi nomi, titoli e chiavi non vengono duplicati) e
 * memorizza il documento. Restituisce il nuovo stack e cosa è stato aggiunto.
 */
export function mergeImportedStack(stack: Stack, imp: ImportedStack, doc: StackDoc | null): { stack: Stack; added: ImportCounts } {
  const s: Stack = JSON.parse(JSON.stringify(stack)) as Stack
  const added: ImportCounts = { platforms: 0, languages: 0, frameworks: 0, prerequisites: 0, steps: 0, envVars: 0, repo: false, notes: false }
  const union = <T extends string>(target: T[], values: T[], k: 'platforms' | 'languages' | 'frameworks') => {
    for (const v of values) if (!target.some((t) => fold(t) === fold(v))) (target.push(v), added[k]++)
  }
  union(s.platforms, imp.platforms, 'platforms')
  union(s.languages, imp.languages, 'languages')
  union(s.frameworks, imp.frameworks, 'frameworks')
  if (!s.repoUrl && imp.repoUrl) (s.repoUrl = imp.repoUrl), (added.repo = true)
  if (!s.notes.trim() && imp.notes) (s.notes = imp.notes), (added.notes = true)
  const canon = (n: string) => fold(lookupPrerequisite(n)?.name ?? n)
  for (const p of imp.prerequisites)
    if (!s.prerequisites.some((x) => canon(x.name) === canon(p.name))) (s.prerequisites.push({ ...p, id: newId('pre') }), added.prerequisites++)
  for (const st of imp.steps)
    if (!s.steps.some((x) => fold(x.title) === fold(st.title))) (s.steps.push({ ...st, id: newId('stp') }), added.steps++)
  for (const e of imp.envVars) if (!s.envVars.some((x) => x.key === e.key)) (s.envVars.push(e), added.envVars++)
  if (doc) s.doc = doc
  return { stack: s, added }
}
