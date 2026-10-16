/**
 * Analisi approfondita dello Stack con l'IA locale.
 *
 * Si parte SEMPRE dal risultato deterministico (ciò che i file dicono con
 * certezza) e si chiede al modello solo ciò che manca: prerequisiti, passi di
 * preparazione, variabili d'ambiente, note. Il modello riceve soltanto:
 * - l'elenco delle cartelle e i file che l'analisi ha già letto (con un
 *   limite di dimensione, ripuliti da segreti);
 * - i NOMI delle variabili dei file .env di esempio (mai i valori);
 * - il risultato deterministico.
 * Mai .env, chiavi, certificati, credenziali o la configurazione git.
 * La risposta è vincolata a uno schema e verificata; ciò che propone non
 * sostituisce mai quanto già presente: diventa un elenco di suggerimenti che
 * l'amministratore sceglie se aggiungere.
 */
import { z } from 'zod'
import { getFs } from './fs'
import { chatJson } from './localAi'
import { newId } from './ids'
import { isSafeCheck } from './prereqCheck'
import { lookupPrerequisite } from './prerequisites'
import { isEditorStep, isRunStep, mergeImportedStack, type ImportCounts } from './stackDoc'
import type { ScanTrace } from './projectScan'
import type { AiConfig, EnvVar, Prerequisite, SetupStep, Stack } from '@/types'
import { locale } from '@/i18n'

// ---------------------------------------------------------------------------
// Cosa NON deve mai arrivare al modello
// ---------------------------------------------------------------------------

/** File di esempio delle variabili d'ambiente: se ne leggono solo i nomi. */
export const ENV_EXAMPLE = /(^|\/)\.env\.(example|sample|template|dist|defaults)$/i

const SENSITIVE: RegExp[] = [
  /(^|\/)\.env(\.[^/]*)?$/i, // .env, .env.local, .env.production… (gli esempi sono gestiti a parte)
  /\.(pem|key|p8|p12|pfx|jks|keystore|crt|cer|der|asc|gpg|kdbx|ppk|ovpn|mobileprovision)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)(\.npmrc|\.yarnrc(\.yml)?|\.pypirc|\.netrc|\.git-credentials|\.htpasswd|\.dockercfg|\.pgpass|\.s3cfg)$/i,
  /(^|\/)[^/]*(credential|secret|service[-_]?account|private[-_]?key)[^/]*$/i,
  /(^|\/)(appsettings[^/]*\.json|web\.config|app\.config|local\.settings\.json|connectionstrings[^/]*)$/i,
  /(^|\/)(google-services\.json|googleservice-info\.plist|firebase[^/]*adminsdk[^/]*\.json)$/i,
  /(^|\/)\.(git|ssh|aws|azure|gnupg|docker|kube)(\/|$)/i,
  /(^|\/)([^/]*\.tfvars|[^/]*\.tfstate(\.backup)?)$/i,
]
/** Lockfile: lunghi e inutili per l'analisi. */
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|cargo\.lock|poetry\.lock|composer\.lock|gemfile\.lock|pipfile\.lock|packages\.lock\.json|go\.sum)$/i

export function isSensitivePath(path: string): boolean {
  const p = path.replace(/\\/g, '/')
  if (ENV_EXAMPLE.test(p)) return false
  return SENSITIVE.some((re) => re.test(p))
}

const SECRET_KEY = /(?:pass(?:word|wd)?|pwd|secret|token|api[-_]?key|apikey|private[-_]?key|client[-_]?secret|access[-_]?key|auth[-_]?key|credential|connection[-_]?string|conn[-_]?str|signing[-_]?key|encryption[-_]?key|salt)/i

/** Toglie dal testo ciò che somiglia a un segreto (chiavi private, token, password, credenziali negli URL). */
export function redactSecrets(text: string): string {
  return (
    text
      .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[***]')
      // credenziali negli indirizzi: https://utente:password@host
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:'"]+:[^\s/@'"]+@/gi, '$1***@')
      // token con prefissi noti (GitHub, OpenAI/Anthropic, Slack, AWS, Google, Stripe, JWT)
      .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|[rs]k_(live|test)_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})\b/g, '***')
      // chiave: valore / chiave = valore / "chiave": "valore" con nomi da segreto
      .replace(new RegExp(`(["']?[\\w.-]{0,40}${SECRET_KEY.source}[\\w.-]{0,40}["']?[ \\t]*[:=][ \\t]*)(["']?)([^\\s"',;}]{1,500})\\2`, 'gi'), (_all, head: string, q: string, value: string) =>
        /^(\*+|true|false|null|none|\$\{?[\w.]+\}?|<[^>]*>|%[\w]+%)$/i.test(value) ? `${head}${q}${value}${q}` : `${head}${q}***${q}`,
      )
      // Password=…; nelle stringhe di connessione
      .replace(/\b(password|pwd|user id|uid)\s*=\s*[^;"']+/gi, '$1=***')
  )
}

/** Solo i nomi delle variabili (e i commenti) di un file .env di esempio: i valori non escono mai. */
export function envExampleKeys(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l)
    .map((l) => {
      if (l.startsWith('#')) return redactSecrets(l).slice(0, 160)
      const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=/.exec(l)
      return m ? `${m[1]}=` : ''
    })
    .filter(Boolean)
    .slice(0, 120)
    .join('\n')
}

/** Legge i file .env di esempio della radice (solo i nomi delle variabili). */
export async function readEnvExamples(dir: string, rootNames: string[]): Promise<Map<string, string>> {
  const fs = await getFs()
  const out = new Map<string, string>()
  for (const name of rootNames.filter((n) => ENV_EXAMPLE.test(n)).slice(0, 4)) {
    const text = await fs.readText(await fs.join(dir, name)).catch(() => null)
    if (text && text.length < 200_000) out.set(name, envExampleKeys(text))
  }
  return out
}

// ---------------------------------------------------------------------------
// Contesto per il modello
// ---------------------------------------------------------------------------

/** Circa 7.000 token in tutto: con la risposta stanno in un contesto di 12k (memoria contenuta anche su PC modesti). */
export const LIMITS = { perFile: 6_000, total: 20_000, entriesPerDir: 80, dirs: 15 }

/** Contesto ripulito: elenchi, file (ordinati, troncati, senza segreti), variabili d'esempio. */
export function buildContext(trace: ScanTrace, envExamples: Map<string, string> = new Map()) {
  const listings: string[] = []
  for (const [dir, entries] of [...trace.listings.entries()].slice(0, LIMITS.dirs)) {
    const names = entries
      .filter((e) => !/^(node_modules|\.git)$/i.test(e.name))
      .slice(0, LIMITS.entriesPerDir)
      .map((e) => (e.isDir ? `${e.name}/` : e.name))
    listings.push(`${dir || '.'}: ${names.join(', ')}`)
  }
  const files: { name: string; content: string }[] = []
  const usable = [...trace.files.entries()].filter(([name]) => !isSensitivePath(name) && !NOISE.test(name.replace(/\\/g, '/')) && !ENV_EXAMPLE.test(name))
  // Prima i file di progetto (manifest), poi i documenti (README, ARCHITETTURA)
  usable.sort(([a], [b]) => Number(/\.md$/i.test(a)) - Number(/\.md$/i.test(b)))
  let budget = LIMITS.total
  for (const [name, raw] of usable) {
    if (budget <= 400) break
    const max = Math.min(LIMITS.perFile, budget)
    // Prima si taglia, poi si ripulisce (così si lavora su poco testo)
    const clean = redactSecrets(raw.length > max ? raw.slice(0, max + 200) : raw)
    const content = clean.length > max ? `${clean.slice(0, max)}\n[…]` : clean
    files.push({ name, content })
    budget -= content.length
  }
  const env = [...envExamples.entries()].filter(([, keys]) => keys).map(([name, keys]) => ({ name, keys }))
  return { listings, files, env }
}

const summary = (s: Stack) =>
  JSON.stringify({
    platforms: s.platforms,
    languages: s.languages,
    frameworks: s.frameworks,
    prerequisites: s.prerequisites.map((p) => (p.version ? `${p.name} ${p.version}` : p.name)),
    steps: s.steps.map((x) => (x.command ? `${x.title}: ${x.command}` : x.title)),
    envVars: s.envVars.map((v) => v.key),
    notes: s.notes.slice(0, 600),
  })

const PROMPT = {
  it: {
    system: `Sei un esperto di configurazione di ambienti di sviluppo. Analizzi i file di un progetto software per completare la sua scheda «Stack»: cosa installare sul PC (prerequisiti), i passi per preparare il progetto, le variabili d'ambiente da impostare e note utili a chi lo configura.
Regole:
- Proponi SOLO ciò che manca nel RISULTATO ATTUALE; non ripetere nulla di quanto già presente.
- Ogni proposta deve basarsi su ciò che si legge nei file forniti. Niente supposizioni generiche.
- Passi: solo preparazione (installare dipendenze, copiare file di configurazione, creare il database, migrazioni). Mai avvio, build, test o pubblicazione.
- Prerequisiti: programmi da installare sul PC. La versione solo se i file la dichiarano. "check" è un comando che stampa solo la versione (es. "node -v"), altrimenti vuoto. "reason": in quale file l'hai letto.
- Variabili d'ambiente: solo quelle citate nei file; mai valori.
- languages e frameworks: solo se il RISULTATO ATTUALE non ne ha.
- Scrivi in italiano, testi brevi. Se non c'è nulla da aggiungere, elenchi vuoti.`,
    current: 'RISULTATO ATTUALE (già certo, non ripeterlo)',
    tree: 'CARTELLE',
    env: 'VARIABILI DEI FILE .env DI ESEMPIO (solo i nomi)',
    files: 'FILE',
  },
  en: {
    system: `You are an expert in development environment setup. You analyze the files of a software project to complete its "Stack" sheet: what to install on the PC (prerequisites), the steps to prepare the project, the environment variables to set and notes useful to whoever sets it up.
Rules:
- Propose ONLY what is missing from the CURRENT RESULT; never repeat anything already there.
- Every proposal must be based on what the given files say. No generic guesses.
- Steps: preparation only (install dependencies, copy configuration files, create the database, migrations). Never run, build, test or publish.
- Prerequisites: programs to install on the PC. Version only if the files declare it. "check" is a command that only prints the version (e.g. "node -v"), otherwise empty. "reason": which file you read it in.
- Environment variables: only those mentioned in the files; never values.
- languages and frameworks: only if the CURRENT RESULT has none.
- Write in English, short texts. If there is nothing to add, empty lists.`,
    current: 'CURRENT RESULT (already certain, do not repeat it)',
    tree: 'FOLDERS',
    env: 'VARIABLES IN THE EXAMPLE .env FILES (names only)',
    files: 'FILES',
  },
}[locale]

export function buildStackPrompt(current: Stack, ctx: ReturnType<typeof buildContext>) {
  const parts = [`${PROMPT.current}:\n${summary(current)}`, `${PROMPT.tree}:\n${ctx.listings.join('\n')}`]
  if (ctx.env.length) parts.push(`${PROMPT.env}:\n${ctx.env.map((e) => `--- ${e.name} ---\n${e.keys}`).join('\n')}`)
  if (ctx.files.length) parts.push(`${PROMPT.files}:\n${ctx.files.map((f) => `===== ${f.name} =====\n${f.content}`).join('\n\n')}`)
  return { system: PROMPT.system, user: parts.join('\n\n') }
}

// ---------------------------------------------------------------------------
// Risposta: schema, verifica, suggerimenti
// ---------------------------------------------------------------------------

const str = (max: number) => ({ type: 'string', maxLength: max })
export const STACK_ANSWER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['languages', 'frameworks', 'prerequisites', 'steps', 'envVars', 'notes'],
  properties: {
    languages: { type: 'array', maxItems: 5, items: str(30) },
    frameworks: { type: 'array', maxItems: 8, items: str(40) },
    prerequisites: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'version', 'check', 'reason'],
        properties: { name: str(60), version: str(30), check: str(80), reason: str(160) },
      },
    },
    steps: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'kind', 'command', 'cwd', 'notes'],
        properties: { title: str(120), kind: { type: 'string', enum: ['command', 'manual', 'link'] }, command: str(400), cwd: str(120), notes: str(240) },
      },
    },
    envVars: {
      type: 'array',
      maxItems: 30,
      items: { type: 'object', additionalProperties: false, required: ['key', 'notes'], properties: { key: str(80), notes: str(200) } },
    },
    notes: str(1500),
  },
}

const s = z.string()
export const StackAnswerSchema = z.object({
  languages: z.array(s).default([]),
  frameworks: z.array(s).default([]),
  prerequisites: z.array(z.object({ name: s, version: s.default(''), check: s.default(''), reason: s.default('') })).default([]),
  steps: z
    .array(z.object({ title: s, kind: z.enum(['command', 'manual', 'link']).catch('command'), command: s.default(''), cwd: s.default(''), url: s.default(''), notes: s.default('') }))
    .default([]),
  envVars: z.array(z.object({ key: s, notes: s.default('') })).default([]),
  notes: s.default(''),
})
export type StackAnswer = z.infer<typeof StackAnswerSchema>

export type StackProposal =
  | { id: string; kind: 'language'; value: string }
  | { id: string; kind: 'framework'; value: string }
  | { id: string; kind: 'prerequisite'; prerequisite: Omit<Prerequisite, 'id'>; reason: string }
  | { id: string; kind: 'step'; step: Omit<SetupStep, 'id'> }
  | { id: string; kind: 'envVar'; envVar: EnvVar }
  | { id: string; kind: 'notes'; text: string }

const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const clip = (x: string, n: number) => x.replace(/\s+/g, ' ').trim().slice(0, n)
const canon = (n: string) => fold(lookupPrerequisite(n)?.name ?? n)

/**
 * Dalla risposta del modello ai suggerimenti: si scarta tutto ciò che è già
 * nello stack, che i file escludono, che non è preparazione (avvio, build…),
 * comandi di verifica non sicuri, cartelle fuori dal progetto e segreti.
 */
export function proposalsFrom(current: Stack, answer: StackAnswer, opts: { excluded?: string[] } = {}): StackProposal[] {
  const out: StackProposal[] = []
  const excluded = new Set((opts.excluded ?? []).map(canon))
  const id = () => newId('sug')

  if (!current.languages.length) {
    const seen = new Set<string>()
    for (const l of answer.languages.map((x) => clip(x, 30)).filter(Boolean).slice(0, 5)) if (!seen.has(fold(l))) (seen.add(fold(l)), out.push({ id: id(), kind: 'language', value: l }))
  }
  if (!current.frameworks.length) {
    const seen = new Set<string>()
    for (const f of answer.frameworks.map((x) => clip(x, 40)).filter(Boolean).slice(0, 8)) if (!seen.has(fold(f))) (seen.add(fold(f)), out.push({ id: id(), kind: 'framework', value: f }))
  }

  const prereqs = new Set(current.prerequisites.map((p) => canon(p.name)))
  for (const p of answer.prerequisites.slice(0, 8)) {
    const name = clip(p.name, 60)
    if (!name || prereqs.has(canon(name)) || excluded.has(canon(name))) continue
    prereqs.add(canon(name))
    const known = lookupPrerequisite(name)
    const version = clip(p.version, 30)
    const check = clip(p.check, 80)
    out.push({
      id: id(),
      kind: 'prerequisite',
      prerequisite: {
        name: known?.name ?? name,
        // La versione la dà il modello solo se l'ha letta; altrimenti quella del catalogo
        version: version && /\d/.test(version) ? version : (known?.version ?? ''),
        // Indirizzi solo dal catalogo (mai inventati); verifica solo se è una semplice richiesta di versione
        url: known?.url ?? '',
        check: known?.check ?? (isSafeCheck(check) ? check : ''),
      },
      reason: clip(redactSecrets(p.reason), 160),
    })
  }

  const steps = new Set(current.steps.map((x) => fold(x.title)))
  const commands = new Set(current.steps.map((x) => fold(x.command)).filter(Boolean))
  for (const st of answer.steps.slice(0, 10)) {
    const title = clip(st.title, 120)
    const command = st.command.trim().slice(0, 400)
    if (!title || steps.has(fold(title)) || (command && commands.has(fold(command)))) continue
    if (isRunStep({ title, command }) || isEditorStep({ title, command })) continue
    const cwd = st.cwd.trim().replace(/\//g, '\\')
    if (/(^|[\\/])\.\.([\\/]|$)|^[a-z]:|^[\\/]/i.test(cwd)) continue // solo cartelle dentro il progetto
    const url = /^https:\/\//i.test(st.url.trim()) ? st.url.trim() : ''
    if (st.kind === 'link' && !url) continue
    steps.add(fold(title))
    out.push({ id: id(), kind: 'step', step: { title, kind: st.kind, command: st.kind === 'command' ? redactSecrets(command) : '', cwd: cwd.slice(0, 120), url, notes: clip(redactSecrets(st.notes), 240) } })
  }

  const keys = new Set(current.envVars.map((v) => v.key.toUpperCase()))
  for (const v of answer.envVars.slice(0, 30)) {
    const key = v.key.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key) || keys.has(key.toUpperCase())) continue
    keys.add(key.toUpperCase())
    out.push({ id: id(), kind: 'envVar', envVar: { key, example: '', notes: clip(redactSecrets(v.notes), 200) } })
  }

  const notes = redactSecrets(answer.notes.trim()).slice(0, 1500)
  if (notes && !fold(current.notes).includes(fold(notes).slice(0, 80))) out.push({ id: id(), kind: 'notes', text: notes })
  return out
}

/** Aggiunge i suggerimenti scelti, senza togliere né cambiare nulla di quanto c'è. */
export function applyProposals(stack: Stack, proposals: StackProposal[]): { stack: Stack; added: ImportCounts } {
  const pick = <K extends StackProposal['kind']>(k: K) => proposals.filter((p): p is Extract<StackProposal, { kind: K }> => p.kind === k)
  const r = mergeImportedStack(
    stack,
    {
      title: '',
      description: '',
      platforms: [],
      languages: pick('language').map((p) => p.value),
      frameworks: pick('framework').map((p) => p.value),
      repoUrl: '',
      notes: '',
      prerequisites: pick('prerequisite').map((p) => p.prerequisite),
      steps: [],
      envVars: pick('envVar').map((p) => p.envVar),
    },
    stack.doc,
  )
  const s = r.stack
  // Passi: prima di quello che apre l'editor (la configurazione finisce lì)
  const newSteps = pick('step')
    .filter((p) => !s.steps.some((x) => fold(x.title) === fold(p.step.title)))
    .map((p) => ({ ...p.step, id: newId('stp') }))
  if (newSteps.length) {
    const at = s.steps.findIndex((x) => isEditorStep(x))
    s.steps.splice(at >= 0 ? at : s.steps.length, 0, ...newSteps)
    r.added.steps += newSteps.length
  }
  const notes = pick('notes').map((p) => p.text)
  if (notes.length) {
    s.notes = [s.notes.trim(), ...notes].filter(Boolean).join('\n\n')
    r.added.notes = true
  }
  return r
}

/**
 * Analisi approfondita: dal risultato deterministico e da quanto letto, i
 * suggerimenti da proporre all'amministratore. Lancia un errore se il motore
 * non risponde o la risposta non è valida (chi chiama la ignora).
 */
export async function analyzeStack(
  cfg: AiConfig,
  input: { current: Stack; trace: ScanTrace; envExamples?: Map<string, string>; excluded?: string[] },
): Promise<StackProposal[]> {
  const ctx = buildContext(input.trace, input.envExamples)
  const { system, user } = buildStackPrompt(input.current, ctx)
  const answer = await chatJson(cfg, { system, user, schema: STACK_ANSWER_JSON_SCHEMA, validate: StackAnswerSchema, timeoutMs: 300_000, numCtx: 12_288 })
  return proposalsFrom(input.current, answer, { excluded: input.excluded })
}
