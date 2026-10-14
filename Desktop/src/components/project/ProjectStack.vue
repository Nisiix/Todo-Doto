<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, Copy, ExternalLink, FileCode, FileDown, FileText, FileUp, FolderOpen, Import, Loader2, MinusCircle, Pencil, Play, Plus, RefreshCw, Save, Trash2, Wand2, XCircle } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ChipsInput from '@/components/ui/ChipsInput.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import GitHubMark from '@/components/ui/GitHubMark.vue'
import { useConfirm } from '@/composables/useConfirm'
import { usePrereqChecks } from '@/composables/usePrereqChecks'
import { blocksAutoSetup, isSatisfied, needsAction, planCheck, type CheckStatus } from '@/services/prereqCheck'
import { parseGitHubRepo } from '@/services/github'
import { checkFolder } from '@/services/fsErrors'
import { useGitHubStore } from '@/stores/github'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs, isTauri } from '@/services/fs'
import { autofillPrerequisite, KNOWN_PREREQUISITES, lookupPrerequisite, suggestPrerequisites } from '@/services/prerequisites'
import { mergeImportedStack, parseStackMarkdown, type ImportCounts } from '@/services/stackDoc'
import { newId } from '@/services/ids'
import { setupScriptWindows } from '@/services/analytics'
import { copyStack, hasStack, resolveStack, slugify, varsFor } from '@/services/scaffold'
import { PLATFORMS, PLATFORM_LABEL, SETUP_STEP_KINDS, SETUP_STEP_LABEL, type Prerequisite, type Project, type Stack } from '@/types'
import { DATE, defineMessages, plural } from '@/i18n'
import dayjs from 'dayjs'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    saved: 'Stack salvato',
    copied: 'Copiato',
    copyFailed: 'Copia non riuscita: seleziona e copia il testo a mano.',
    cannotOpen: (err: string) => `Non riesco ad aprire: ${err}`,
    saveScript: 'Salva lo script di configurazione',
    scriptSaved: 'Script salvato: aprilo con doppio click per eseguire i passi in sequenza',
    openFolder: 'Apri cartella',
    title: 'Stack e configurazione',
    lead: 'Con cosa è fatto il progetto e come metterlo in piedi sul proprio PC, passo per passo.',
    fill: 'Aggiungi stack tecnologico',
    appType: 'Tipo di applicazione',
    type: 'Tipo',
    languages: 'Linguaggi',
    languagesPh: 'Es. TypeScript, C#, Rust',
    frameworks: 'Framework',
    frameworksLong: 'Framework e librerie',
    frameworksPh: 'Es. Vue 3, Tauri, .NET 4.0',
    repo: 'Repository',
    repoPh: 'https://github.com/… oppure \\\\server\\git\\progetto',
    sourcePath: 'Cartella del progetto',
    sourcePathLong: 'Cartella del progetto (sul PC o in rete)',
    sourcePh: 'Z:\\Progetti\\NomeProgetto',
    copyPath: 'Copia percorso',
    notes: 'Note per chi inizia',
    notesPh: 'Architettura in due righe, cose da sapere, chi contattare…',
    prereqs: 'Prerequisiti da installare',
    prereq: 'Prerequisito',
    prereqNamed: (n: string) => `Prerequisito: ${n}`,
    prereqName: 'Nome, es. Node.js',
    version: 'Versione',
    downloadUrl: 'Dove scaricarlo (URL)',
    checkCmd: 'Comando di verifica, es. node -v',
    prereqsHint: 'Es. Node.js 20+, Rust, .NET SDK, Visual Studio Build Tools…',
    steps: 'Passi di configurazione, nell’ordine',
    step: 'Passo',
    stepTitle: 'Titolo del passo, es. Installa le dipendenze',
    moveUp: 'Sposta su',
    moveDown: 'Sposta giù',
    commands: 'Uno o più comandi, uno per riga (es. npm install)',
    manual: 'Cosa fare a mano',
    cwd: 'Cartella (facoltativa)',
    shortNote: 'Nota breve (facoltativa)',
    stepsHint: 'Es. 1) clona il repository · 2) npm install · 3) copia .env.example in .env · 4) npm run dev',
    envVars: 'Variabili d’ambiente e configurazioni',
    envVar: 'Variabile',
    varName: 'NOME_VARIABILE',
    varExample: 'valore di esempio',
    varNotes: 'A cosa serve / dove si prende',
    emptyAdmin: 'Nessuna informazione ancora. Aggiungi lo stack tecnologico (o importalo da un altro progetto): linguaggi, framework, repository, prerequisiti e i passi per configurare il progetto. Gli altri utenti troveranno qui una procedura guidata.',
    emptyMember: 'L’amministratore non ha ancora descritto lo stack di questo progetto.',
    setupTitle: 'Configura sul tuo PC',
    setupLead: (done: number, total: number) => `Segui i passi nell’ordine e spunta quelli fatti: il progresso è tuo, non si vede agli altri. ${done} di ${total} completati.`,
    restart: 'Ricomincia',
    scriptHint: 'Esegue sul tuo PC, in sequenza, le verifiche dei prerequisiti e i comandi dei passi',
    genScript: 'Gestisci configurazione automatica',
    autoTitle: (n: string) => `Configurazione automatica di ${n}`,
    autoLead: 'Lo script esegue sul tuo PC, in una finestra del prompt dei comandi, le verifiche e i comandi elencati qui sotto, uno dopo l’altro; si ferma al primo errore e sui passi da fare a mano.',
    autoWorkdir: 'Cartella in cui si eseguono i comandi',
    autoNoWorkdir: 'Nessuna cartella del progetto indicata: i comandi partono dalla cartella dello script. Puoi impostarla nelle impostazioni del progetto.',
    autoChecks: 'Verifiche',
    autoSteps: 'Passi',
    autoManual: 'da fare a mano',
    autoRun: 'Avvia configurazione',
    autoSave: 'Salva lo script…',
    autoStarted: 'Configurazione avviata in una finestra del prompt dei comandi',
    autoFailed: (err: string) => `Non riesco ad avviare la configurazione: ${err}`,
    autoDesktopOnly: 'L’esecuzione della configurazione è disponibile nell’app desktop: salva lo script e avvialo con doppio click.',
    cmdCopied: 'Comando copiato',
    copyCheck: 'Copia verifica',
    download: 'Scarica',
    markTodo: 'Segna come da fare',
    unsaved: 'Modifiche non salvate',
    noChanges: 'Nessuna modifica',
    saveHint: 'Salva (Ctrl+S)',
    prereqsAuto: 'Scrivendo il nome di uno strumento noto (Node.js, Git, Rust, .NET SDK, Python…) versione, link e comando di verifica si compilano da soli; quelli richiesti da linguaggi e framework vengono aggiunti automaticamente.',
    suggested: 'Suggeriti da linguaggi e framework:',
    autoAdded: (names: string) => `Prerequisiti aggiunti in automatico: ${names}`,
    autofilled: (name: string) => `Completati i dati di ${name}`,
    importMd: 'Importa .md',
    importMdHint: 'Importa un documento di architettura in Markdown (README, ARCHITETTURA.md…) per precompilare lo stack',
    pickMd: 'Scegli il documento di architettura (.md)',
    mdImported: (file: string, parts: string) => (parts ? `Da «${file}»: ${parts}. Controlla e salva.` : `«${file}» memorizzato; nessun dato nuovo da aggiungere. Controlla e salva.`),
    mdFailed: (err: string) => `Non riesco a leggere il documento: ${err}`,
    mdParts: (c: ImportCounts) =>
      [
        c.platforms && `${c.platforms} ${plural(c.platforms, 'tipo', 'tipi')} di applicazione`,
        c.languages && `${c.languages} linguaggi`,
        c.frameworks && `${c.frameworks} framework`,
        c.repo && 'repository',
        c.notes && 'note',
        c.prerequisites && `${c.prerequisites} prerequisiti`,
        c.steps && `${c.steps} passi`,
        c.envVars && `${c.envVars} variabili`,
      ]
        .filter(Boolean)
        .join(', '),
    doc: 'Documento di architettura',
    docImported: (d: string) => `importato il ${d}`,
    viewDoc: 'Vedi documento',
    removeDoc: 'Togli il documento',
    importFrom: 'Importa stack da altro progetto',
    importFromHint: 'Copia stack e configurazione di un altro progetto esistente in questo (poi controlli e salvi)',
    importTitle: (n: string) => `Sostituire lo stack con quello di «${n}»?`,
    importMessage: 'Le modifiche non salvate vanno perse. Il nome dell’altro progetto viene sostituito con quello di questo progetto; la cartella locale resta.',
    importConfirm: 'Importa',
    imported: (n: string) => `Stack importato da «${n}»: controlla e salva`,
    files: 'File iniziali',
    filesHint: 'File scritti nella cartella del progetto quando la si crea, alla creazione del progetto. In percorsi e contenuti puoi usare {{name}} (nome del progetto) e {{slug}} (nome per cartelle e URL); vale anche per comandi e link dei passi.',
    file: 'File',
    filePath: 'Percorso, es. package.json o src/main.ts',
    fileContent: 'Contenuto del file',
    filesEmpty: 'Es. package.json, .gitignore, .editorconfig, src/main.ts… README.md, .env.example e lo script di configurazione vengono generati in automatico.',
    markDone: 'Segna come fatto',
    chkChecking: 'Verifico…',
    chkOk: (v: string) => (v ? `Installato · ${v}` : 'Installato'),
    chkInstalled: 'Installato, ma la versione non si legge: controllala a mano',
    chkOutdated: (v: string, req: string) => `Installata la ${v}, serve ${req}: va aggiornato`,
    chkDifferent: (v: string, req: string) => `Installata la ${v}, indicata ${req}: verifica che vada bene`,
    chkMissing: 'Non trovato su questo PC: va installato',
    chkFailed: 'Verifica non riuscita: controlla a mano',
    chkTimeout: 'Nessuna risposta entro 20 secondi: controlla a mano',
    chkManual: 'Nessuna verifica automatica possibile: controlla a mano',
    chkOtherOs: 'Non serve su questo sistema operativo',
    chkConfirm: 'Comando di verifica personalizzato: non è partito da solo',
    chkUnavailable: 'La verifica automatica è disponibile nell’app desktop',
    recheck: 'Ricontrolla',
    recheckHint: 'Verifica di nuovo sul tuo PC che i prerequisiti siano installati',
    runCheck: 'Esegui verifica',
    runCheckTitle: 'Eseguire il comando di verifica?',
    runCheckMessage: (cmd: string) => `«${cmd}» non è una semplice richiesta di versione e verrà eseguito sul tuo PC. Eseguilo solo se sai cosa fa.`,
    runCheckConfirm: 'Esegui',
    details: 'Dettagli',
    confirmInstalled: 'Confermo che è installato e va bene',
    autoDetected: 'Verificato automaticamente',
    installFirst: 'Installalo o aggiornalo, poi ricontrolla',
    prereqSummary: (ok: number, action: number, uncertain: number) =>
      [ok && `${ok} ${plural(ok, 'installato', 'installati')}`, action && `${action} da installare o aggiornare`, uncertain && `${uncertain} da verificare a mano`].filter(Boolean).join(' · '),
    autoBlocked: 'Configurazione automatica bloccata',
    autoBlockedLead: 'Prima di avviare lo script risolvi questi prerequisiti: installa quelli mancanti o da aggiornare e premi «Ricontrolla»; per quelli incerti controlla a mano e spunta il cerchio nella procedura.',
    autoChecking: 'Verifica dei prerequisiti in corso…',
    blockedHint: 'Risolvi prima i prerequisiti segnalati',
    ghSynced: (when: string) => `sincronizzato ${when}`,
    ghNever: 'mai sincronizzato',
    ghSync: 'Sincronizza',
    ghSyncHint: 'Aggiorna lo stack dai file del repository GitHub (senza cancellare nulla)',
    ghLink: 'Collega a GitHub',
    ghLinkHint: 'Collega il progetto al repository GitHub indicato e sincronizza lo stack dai suoi file',
    ghNotConnected: 'Collega prima il tuo account GitHub',
    ghSynced2: 'Stack sincronizzato da GitHub',
    ghFailed: (err: string) => `Sincronizzazione non riuscita: ${err}`,
  },
  en: {
    saved: 'Stack saved',
    copied: 'Copied',
    copyFailed: 'Copy failed: select and copy the text by hand.',
    cannotOpen: (err: string) => `Cannot open: ${err}`,
    saveScript: 'Save the setup script',
    scriptSaved: 'Script saved: double-click it to run the steps in sequence',
    openFolder: 'Open folder',
    title: 'Stack and setup',
    lead: 'What the project is built with and how to get it running on your own PC, step by step.',
    fill: 'Add technology stack',
    appType: 'Application type',
    type: 'Type',
    languages: 'Languages',
    languagesPh: 'E.g. TypeScript, C#, Rust',
    frameworks: 'Frameworks',
    frameworksLong: 'Frameworks and libraries',
    frameworksPh: 'E.g. Vue 3, Tauri, .NET 4.0',
    repo: 'Repository',
    repoPh: 'https://github.com/… or \\\\server\\git\\project',
    sourcePath: 'Project folder',
    sourcePathLong: 'Project folder (on the PC or the network)',
    sourcePh: 'Z:\\Projects\\ProjectName',
    copyPath: 'Copy path',
    notes: 'Notes for newcomers',
    notesPh: 'Architecture in two lines, things to know, who to contact…',
    prereqs: 'Prerequisites to install',
    prereq: 'Prerequisite',
    prereqNamed: (n: string) => `Prerequisite: ${n}`,
    prereqName: 'Name, e.g. Node.js',
    version: 'Version',
    downloadUrl: 'Where to download it (URL)',
    checkCmd: 'Check command, e.g. node -v',
    prereqsHint: 'E.g. Node.js 20+, Rust, .NET SDK, Visual Studio Build Tools…',
    steps: 'Setup steps, in order',
    step: 'Step',
    stepTitle: 'Step title, e.g. Install the dependencies',
    moveUp: 'Move up',
    moveDown: 'Move down',
    commands: 'One or more commands, one per line (e.g. npm install)',
    manual: 'What to do by hand',
    cwd: 'Folder (optional)',
    shortNote: 'Short note (optional)',
    stepsHint: 'E.g. 1) clone the repository · 2) npm install · 3) copy .env.example to .env · 4) npm run dev',
    envVars: 'Environment variables and configuration',
    envVar: 'Variable',
    varName: 'VARIABLE_NAME',
    varExample: 'example value',
    varNotes: 'What it is for / where to get it',
    emptyAdmin: 'No information yet. Add the technology stack (or import it from another project): languages, frameworks, repository, prerequisites and the steps to set up the project. Other users will find a guided procedure here.',
    emptyMember: 'The administrator has not described this project’s stack yet.',
    setupTitle: 'Set up on your PC',
    setupLead: (done: number, total: number) => `Follow the steps in order and tick the ones you have done: your progress is yours only, others cannot see it. ${done} of ${total} completed.`,
    restart: 'Start over',
    scriptHint: 'Runs the prerequisite checks and step commands on your PC, in sequence',
    genScript: 'Manage automatic setup',
    autoTitle: (n: string) => `Automatic setup of ${n}`,
    autoLead: 'The script runs on your PC, in a command prompt window, the checks and commands listed below, one after the other; it stops at the first error and at the manual steps.',
    autoWorkdir: 'Folder where the commands run',
    autoNoWorkdir: 'No project folder set: the commands start from the script folder. You can set it in the project settings.',
    autoChecks: 'Checks',
    autoSteps: 'Steps',
    autoManual: 'manual',
    autoRun: 'Start setup',
    autoSave: 'Save the script…',
    autoStarted: 'Setup started in a command prompt window',
    autoFailed: (err: string) => `Cannot start the setup: ${err}`,
    autoDesktopOnly: 'Running the setup is available in the desktop app: save the script and double-click it.',
    cmdCopied: 'Command copied',
    copyCheck: 'Copy check',
    download: 'Download',
    markTodo: 'Mark as to do',
    unsaved: 'Unsaved changes',
    noChanges: 'No changes',
    saveHint: 'Save (Ctrl+S)',
    prereqsAuto: 'Typing the name of a known tool (Node.js, Git, Rust, .NET SDK, Python…) fills in version, link and check command; the ones required by languages and frameworks are added automatically.',
    suggested: 'Suggested by languages and frameworks:',
    autoAdded: (names: string) => `Prerequisites added automatically: ${names}`,
    autofilled: (name: string) => `Filled in the details of ${name}`,
    importMd: 'Import .md',
    importMdHint: 'Import a Markdown architecture document (README, ARCHITECTURE.md…) to pre-fill the stack',
    pickMd: 'Choose the architecture document (.md)',
    mdImported: (file: string, parts: string) => (parts ? `From “${file}”: ${parts}. Review and save.` : `“${file}” stored; nothing new to add. Review and save.`),
    mdFailed: (err: string) => `Cannot read the document: ${err}`,
    mdParts: (c: ImportCounts) =>
      [
        c.platforms && `${c.platforms} application ${plural(c.platforms, 'type', 'types')}`,
        c.languages && `${c.languages} languages`,
        c.frameworks && `${c.frameworks} frameworks`,
        c.repo && 'repository',
        c.notes && 'notes',
        c.prerequisites && `${c.prerequisites} prerequisites`,
        c.steps && `${c.steps} steps`,
        c.envVars && `${c.envVars} variables`,
      ]
        .filter(Boolean)
        .join(', '),
    doc: 'Architecture document',
    docImported: (d: string) => `imported on ${d}`,
    viewDoc: 'View document',
    removeDoc: 'Remove the document',
    importFrom: 'Import stack from another project',
    importFromHint: 'Copy the stack and setup of another existing project into this one (then review and save)',
    importTitle: (n: string) => `Replace the stack with the one from “${n}”?`,
    importMessage: 'Unsaved changes are lost. The other project’s name is replaced with this project’s name; the local folder is kept.',
    importConfirm: 'Import',
    imported: (n: string) => `Stack imported from “${n}”: review it and save`,
    files: 'Initial files',
    filesHint: 'Files written to the project folder when it is created, together with the project. Paths and contents can use {{name}} (project name) and {{slug}} (name for folders and URLs); this also works in step commands and links.',
    file: 'File',
    filePath: 'Path, e.g. package.json or src/main.ts',
    fileContent: 'File content',
    filesEmpty: 'E.g. package.json, .gitignore, .editorconfig, src/main.ts… README.md, .env.example and the setup script are generated automatically.',
    markDone: 'Mark as done',
    chkChecking: 'Checking…',
    chkOk: (v: string) => (v ? `Installed · ${v}` : 'Installed'),
    chkInstalled: 'Installed, but the version cannot be read: check it by hand',
    chkOutdated: (v: string, req: string) => `${v} installed, ${req} required: it needs updating`,
    chkDifferent: (v: string, req: string) => `${v} installed, ${req} specified: make sure it is fine`,
    chkMissing: 'Not found on this PC: it needs installing',
    chkFailed: 'Check failed: verify by hand',
    chkTimeout: 'No answer within 20 seconds: verify by hand',
    chkManual: 'No automatic check possible: verify by hand',
    chkOtherOs: 'Not needed on this operating system',
    chkConfirm: 'Custom check command: it did not start on its own',
    chkUnavailable: 'The automatic check is available in the desktop app',
    recheck: 'Check again',
    recheckHint: 'Check again on your PC that the prerequisites are installed',
    runCheck: 'Run check',
    runCheckTitle: 'Run the check command?',
    runCheckMessage: (cmd: string) => `“${cmd}” is not a simple version query and will run on your PC. Run it only if you know what it does.`,
    runCheckConfirm: 'Run',
    details: 'Details',
    confirmInstalled: 'I confirm it is installed and fine',
    autoDetected: 'Checked automatically',
    installFirst: 'Install or update it, then check again',
    prereqSummary: (ok: number, action: number, uncertain: number) =>
      [ok && `${ok} installed`, action && `${action} to install or update`, uncertain && `${uncertain} to verify by hand`].filter(Boolean).join(' · '),
    autoBlocked: 'Automatic setup blocked',
    autoBlockedLead: 'Before running the script, sort out these prerequisites: install the missing or outdated ones and press “Check again”; for the uncertain ones verify by hand and tick the circle in the procedure.',
    autoChecking: 'Checking the prerequisites…',
    blockedHint: 'Sort out the flagged prerequisites first',
    ghSynced: (when: string) => `synced ${when}`,
    ghNever: 'never synced',
    ghSync: 'Sync',
    ghSyncHint: 'Update the stack from the GitHub repository files (nothing is deleted)',
    ghLink: 'Link to GitHub',
    ghLinkHint: 'Link the project to the GitHub repository above and sync the stack from its files',
    ghNotConnected: 'Connect your GitHub account first',
    ghSynced2: 'Stack synced from GitHub',
    ghFailed: (err: string) => `Sync failed: ${err}`,
  },
})

/**
 * Sezione "Stack": tecnologie del progetto e configurazione guidata.
 * L'admin compila (linguaggi, framework, repository, cartella, prerequisiti,
 * passi, variabili); gli altri utenti seguono la procedura passo per passo,
 * copiano i comandi o generano uno script che fa tutto in sequenza.
 */
const props = defineProps<{ project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

const stack = computed(() => props.project.stack)
/** Lo stack come lo vede chi lo segue: segnaposto {{name}} e {{slug}} risolti per questo progetto. */
const view = computed(() => resolveStack(stack.value, varsFor(props.project.name)))
const canEdit = computed(() => ws.isAdmin && !props.readOnly)
const editing = ref(false)
const draft = ref<Stack>(clone(stack.value))
function clone(s: Stack): Stack {
  return JSON.parse(JSON.stringify(s)) as Stack
}
watch(stack, (s) => {
  if (!editing.value) draft.value = clone(s)
})
const isEmpty = computed(() => {
  const s = stack.value
  return !s.platforms.length && !s.languages.length && !s.frameworks.length && !s.repoUrl && !s.sourcePath && !s.notes && !s.prerequisites.length && !s.steps.length && !s.envVars.length && !s.files.length && !s.doc
})
/** Ci sono modifiche non salvate nella bozza? */
const dirty = computed(() => editing.value && JSON.stringify(draft.value) !== JSON.stringify(stack.value))

function startEdit() {
  draft.value = clone(stack.value)
  dismissed.value = new Set()
  editing.value = true
}
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (editing.value && e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    void save()
  }
})
async function save() {
  const d = draft.value
  d.prerequisites = d.prerequisites.filter((p) => p.name.trim())
  d.steps = d.steps.filter((s) => s.title.trim())
  d.envVars = d.envVars.filter((v) => v.key.trim())
  d.files = d.files.filter((f) => f.path.trim())
  await ws.updateStack(props.project.id, d)
  editing.value = false
  ui.toast(m.saved, 'success', undefined, 1800)
}
function cancel() {
  draft.value = clone(stack.value)
  editing.value = false
}
const togglePlatform = (p: Stack['platforms'][number]) =>
  (draft.value.platforms = draft.value.platforms.includes(p) ? draft.value.platforms.filter((x) => x !== p) : [...draft.value.platforms, p])
const move = <T,>(arr: T[], i: number, dir: -1 | 1) => {
  const j = i + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
}
// --- prerequisiti: completamento automatico ---------------------------------------
/** Prerequisiti tolti a mano: non vengono riproposti in automatico. */
const dismissed = ref(new Set<string>())
const knownNames = KNOWN_PREREQUISITES.map((k) => k.name)
/** Prerequisiti deducibili da linguaggi, framework e repository e non ancora in elenco. */
const suggestions = computed(() => (editing.value ? suggestPrerequisites(draft.value) : []))
const addKnown = (names: string[]) => {
  for (const name of names) {
    const k = KNOWN_PREREQUISITES.find((x) => x.name === name)
    if (k) draft.value.prerequisites.push({ id: newId('pre'), name: k.name, version: k.version, url: k.url, check: k.check })
  }
}
// Quando cambiano linguaggi, framework o repository, si aggiungono i prerequisiti che richiedono
watch(
  () => [draft.value.languages.join('|'), draft.value.frameworks.join('|'), draft.value.repoUrl],
  (_, before) => {
    if (!editing.value || !before) return
    const names = suggestions.value.map((k) => k.name).filter((n) => !dismissed.value.has(n))
    if (!names.length) return
    addKnown(names)
    ui.toast(m.autoAdded(names.join(', ')), 'info', undefined, 3500)
  },
)
function onPrereqName(p: Prerequisite) {
  if (autofillPrerequisite(p)) ui.toast(m.autofilled(p.name), 'success', undefined, 1500)
}
function removePrereq(i: number) {
  const [p] = draft.value.prerequisites.splice(i, 1)
  const known = p ? lookupPrerequisite(p.name) : null
  if (known) dismissed.value = new Set([...dismissed.value, known.name])
}

// --- importazione di un documento .md (admin) -----------------------------------------
const mdInput = ref<HTMLInputElement | null>(null)
async function importMarkdown() {
  if (!isTauri) return mdInput.value?.click() // anteprima nel browser: selettore di file del browser
  const fs = await getFs()
  const path = await fs.pickFile(m.pickMd)
  if (!path) return
  try {
    applyMarkdown(path.split(/[\\/]/).pop() ?? 'ARCHITETTURA.md', await fs.readText(path))
  } catch (e) {
    ui.toast(m.mdFailed(e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
  }
}
async function onMdFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) applyMarkdown(file.name, await file.text())
}
function applyMarkdown(fileName: string, content: string) {
  if (!editing.value) startEdit()
  const { stack: merged, added } = mergeImportedStack(draft.value, parseStackMarkdown(content), { fileName, content, importedAt: new Date().toISOString() })
  draft.value = merged
  ui.toast(m.mdImported(fileName, m.mdParts(added)), 'success', undefined, 7000)
}
const showDoc = ref(false)

// --- importazione dello stack da un altro progetto (admin): si controlla e si salva ---
const importMenu = computed(() =>
  ws.visibleProjects
    .filter((p) => p.id !== props.project.id && hasStack(p.stack))
    .map((p) => ({ label: p.name, onSelect: () => importFrom(p) })),
)
async function importFrom(source: Project) {
  if (!editing.value) startEdit()
  if (hasStack(draft.value) && !(await confirm({ title: m.importTitle(source.name), message: m.importMessage, confirmLabel: m.importConfirm }))) return
  draft.value = { ...copyStack(source.stack, source.name, props.project.name), sourcePath: draft.value.sourcePath }
  ui.toast(m.imported(source.name), 'info', undefined, 4000)
}

// --- cartella del progetto (creata insieme al progetto) ----------------------------
/**
 * Cartella del progetto sul disco: quella indicata nello stack, altrimenti
 * <cartella dei progetti del workspace>/<nome del progetto>; vuota se nessuna delle due è nota.
 */
async function projectDir(): Promise<string> {
  if (stack.value.sourcePath) return view.value.sourcePath
  const root = ws.projectsRoot
  return root ? (await getFs()).join(root, props.project.name) : ''
}

async function pickSource() {
  const fs = await getFs()
  const p = await fs.pickFolder(m.sourcePath)
  if (!p) return
  draft.value.sourcePath = p
  const problem = await checkFolder(fs, p)
  if (problem) ui.toast(problem, 'warning', undefined, 8000)
}

// --- procedura guidata (stato per utente, sul PC) ---------------------------------
const progressKey = computed(() => `pgm:setup:${props.project.id}:${ws.currentUser?.id ?? 'anon'}`)
const done = ref(new Set<string>())
function loadProgress() {
  try {
    done.value = new Set(JSON.parse(localStorage.getItem(progressKey.value) ?? '[]') as string[])
  } catch {
    done.value = new Set()
  }
}
watch(progressKey, loadProgress, { immediate: true })
function toggleDone(id: string) {
  done.value.has(id) ? done.value.delete(id) : done.value.add(id)
  done.value = new Set(done.value)
  try {
    localStorage.setItem(progressKey.value, JSON.stringify([...done.value]))
  } catch {
    /* solo comodità locale */
  }
}
const totalSteps = computed(() => stack.value.prerequisites.length + stack.value.steps.length)

// --- verifica automatica dei prerequisiti sul PC -------------------------------------
const checks = usePrereqChecks(computed(() => view.value.prerequisites))
const statusOf = (id: string): CheckStatus | undefined => (checks.checking.value.has(id) ? undefined : checks.results.value[id]?.status)
/** Prerequisito fatto: verificato in automatico, oppure confermato a mano se la verifica non dice che manca. */
const prereqDone = (id: string) => isSatisfied(statusOf(id)) || (done.value.has(id) && !needsAction(statusOf(id)))
/** Il cerchio si spunta a mano solo quando l'esito è incerto (verificato o mancante decide la verifica). */
const prereqLocked = (id: string) => isSatisfied(statusOf(id)) || needsAction(statusOf(id))
const prereqStats = computed(() => {
  const r = { ok: 0, action: 0, uncertain: 0 }
  for (const p of view.value.prerequisites) {
    const st = statusOf(p.id)
    if (needsAction(st)) r.action++
    else if (prereqDone(p.id)) r.ok++
    else r.uncertain++
  }
  return r
})
/** Prerequisiti che impediscono la configurazione automatica: mancanti, da aggiornare o incerti non confermati. */
const blockers = computed(() => view.value.prerequisites.filter((p) => blocksAutoSetup(statusOf(p.id), done.value.has(p.id))))
const autoBlocked = computed(() => checks.busy.value || blockers.value.length > 0)
function statusText(p: Prerequisite): string {
  const r = checks.results.value[p.id]
  if (!r || checks.checking.value.has(p.id)) return m.chkChecking
  const req = p.version.trim()
  switch (r.status) {
    case 'ok':
      return m.chkOk(r.version)
    case 'installed':
      return m.chkInstalled
    case 'outdated':
      return m.chkOutdated(r.version, req)
    case 'different':
      return m.chkDifferent(r.version, req)
    case 'missing':
      return m.chkMissing
    case 'failed':
      return m.chkFailed
    case 'timeout':
      return m.chkTimeout
    case 'manual':
      return m.chkManual
    case 'otherOs':
      return m.chkOtherOs
    case 'confirm':
      return m.chkConfirm
    case 'unavailable':
      return m.chkUnavailable
  }
}
const statusTone = (id: string) => {
  const st = statusOf(id)
  if (!st) return 'text-ink-3'
  if (isSatisfied(st)) return 'text-ok'
  if (needsAction(st)) return 'text-danger'
  if (st === 'unavailable') return 'text-ink-3'
  return 'text-p-alta'
}
async function runCustomCheck(p: Prerequisite) {
  const command = planCheck(p, checks.os).command
  if (await confirm({ title: m.runCheckTitle, message: m.runCheckMessage(command), confirmLabel: m.runCheckConfirm, danger: true })) await checks.confirmAndCheck(p)
}

const doneCount = computed(() => view.value.prerequisites.filter((p) => prereqDone(p.id)).length + stack.value.steps.filter((x) => done.value.has(x.id)).length)
function resetProgress() {
  done.value = new Set()
  try {
    localStorage.removeItem(progressKey.value)
  } catch {
    /* ignora */
  }
}

async function copy(text: string, what = m.copied) {
  try {
    await navigator.clipboard.writeText(text)
    ui.toast(what, 'success', undefined, 1500)
  } catch {
    ui.toast(m.copyFailed, 'warning')
  }
}
const open = async (target: string, kind: 'file' | 'link') => {
  try {
    await (await getFs()).openExternal(target, kind)
  } catch (e) {
    ui.toast(m.cannotOpen(e instanceof Error ? e.message : String(e)), 'error')
  }
}
// --- configurazione automatica: lo script eseguito dall'app ---------------------------
const showAuto = ref(false)
const autoDir = ref('')
async function openAuto() {
  autoDir.value = await projectDir()
  showAuto.value = true
  // Esiti freschi prima di decidere se lo script può partire
  void checks.checkAll(true)
}
const script = () => setupScriptWindows(props.project.name, view.value, { baseDir: autoDir.value })
/** Scrive lo script nella cartella dati dell'app e lo apre: Windows lo esegue nel prompt dei comandi. */
async function runAuto() {
  if (autoBlocked.value) return
  if (!isTauri) return ui.toast(m.autoDesktopOnly, 'info', undefined, 6000)
  try {
    const fs = await getFs()
    const dir = await fs.join(await fs.appDataDir(), 'scripts')
    await fs.mkdir(dir)
    const path = await fs.join(dir, `setup-${slugify(props.project.name)}.cmd`)
    await fs.writeTextAtomic(path, script())
    await fs.openExternal(path, 'file')
    showAuto.value = false
    ui.toast(m.autoStarted, 'success', undefined, 5000)
  } catch (e) {
    ui.toast(m.autoFailed(e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
  }
}
async function downloadScript() {
  if (autoBlocked.value) return
  const fs = await getFs()
  const name = `setup-${slugify(props.project.name)}.cmd`
  const path = await fs.saveFile(name, m.saveScript)
  if (!path) return
  await fs.writeTextAtomic(path, script())
  ui.toast(m.scriptSaved, 'success', { label: m.openFolder, run: () => open(path.replace(/[\\/][^\\/]+$/, ''), 'file') }, 6000)
}

// --- GitHub: sincronizzazione dello stack dal repository ---------------------------
const gh = useGitHubStore()
const router = useRouter()
void gh.init()
/** Repository GitHub indicato nello stack ma non ancora collegato. */
const ghRepo = computed(() => (!props.project.github && /github\.com/i.test(stack.value.repoUrl) ? parseGitHubRepo(stack.value.repoUrl) : null))
const ghBusy = ref(false)
async function ghSync() {
  if (!gh.connected) return ui.toast(m.ghNotConnected, 'info', { label: 'GitHub', run: () => router.push({ name: 'github' }) }, 6000)
  ghBusy.value = true
  try {
    const link = props.project.github ?? ghRepo.value
    if (link) await gh.linkProject(props.project, link.owner, link.repo)
    ui.toast(m.ghSynced2, 'success', undefined, 2500)
  } catch (e) {
    ui.toast(m.ghFailed(e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
  } finally {
    ghBusy.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl space-y-8">
    <!-- Intestazione sezione -->
    <div>
      <h2 class="text-[17px] font-bold tracking-tight">{{ m.title }}</h2>
      <p class="mt-0.5 text-[13px] text-ink-2">{{ m.lead }}</p>
    </div>
    <div v-if="canEdit || !isEmpty" class="!mt-3 flex flex-wrap items-center gap-1.5">
      <BaseMenu v-if="canEdit && importMenu.length" :items="importMenu">
        <BaseButton size="sm" variant="ghost" :title="m.importFromHint"><Import :size="14" /> {{ m.importFrom }}</BaseButton>
      </BaseMenu>
      <BaseButton v-if="canEdit" size="sm" variant="ghost" :title="m.importMdHint" @click="importMarkdown"><FileUp :size="14" /> {{ m.importMd }}</BaseButton>
      <input ref="mdInput" type="file" accept=".md,.markdown,.txt,text/markdown" class="hidden" data-md-input @change="onMdFile" />
      <BaseButton v-if="canEdit && !editing" size="sm" @click="startEdit"><Pencil :size="14" /> {{ hasStack(stack) ? common.actions.edit : m.fill }}</BaseButton>
    </div>

    <!-- Repository GitHub collegato (o collegabile) -->
    <div v-if="!editing && (project.github || (canEdit && ghRepo))" class="!mt-3 flex flex-wrap items-center gap-2 text-[13px]" data-github-link>
      <GitHubMark :size="14" class="shrink-0" />
      <template v-if="project.github">
        <span class="font-mono text-[12.5px]">{{ project.github.owner }}/{{ project.github.repo }}</span>
        <span class="text-[12px] text-ink-3">· {{ project.github.syncedAt ? m.ghSynced(dayjs(project.github.syncedAt).fromNow()) : m.ghNever }}</span>
        <BaseButton v-if="canEdit" size="sm" variant="ghost" :disabled="ghBusy" :title="m.ghSyncHint" @click="ghSync"><RefreshCw :size="12" :class="{ 'animate-spin': ghBusy }" /> {{ m.ghSync }}</BaseButton>
      </template>
      <BaseButton v-else size="sm" variant="ghost" :disabled="ghBusy" :title="m.ghLinkHint" @click="ghSync">
        <Loader2 v-if="ghBusy" :size="12" class="animate-spin" /> {{ m.ghLink }} <span class="font-mono text-[12px] text-ink-3">{{ ghRepo!.owner }}/{{ ghRepo!.repo }}</span>
      </BaseButton>
    </div>

    <!-- Documento di architettura importato -->
    <div v-if="(editing ? draft.doc : stack.doc)" class="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[13px]">
      <FileText :size="15" class="shrink-0 text-accent" />
      <span class="font-semibold">{{ m.doc }}:</span>
      <span class="truncate font-mono text-[12.5px]">{{ (editing ? draft.doc : stack.doc)!.fileName }}</span>
      <span v-if="(editing ? draft.doc : stack.doc)!.importedAt" class="shrink-0 text-[12px] text-ink-3">· {{ m.docImported(dayjs((editing ? draft.doc : stack.doc)!.importedAt).format(DATE.date)) }}</span>
      <span class="flex-1" />
      <BaseButton size="sm" variant="ghost" @click="showDoc = true">{{ m.viewDoc }}</BaseButton>
      <BaseButton v-if="editing" size="icon-sm" variant="ghost" :title="m.removeDoc" @click="draft.doc = null"><Trash2 :size="14" /></BaseButton>
    </div>
    <BaseDialog v-model:open="showDoc" :title="(editing ? draft.doc : stack.doc)?.fileName ?? ''" :description="m.doc" width="lg">
      <pre class="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed">{{ (editing ? draft.doc : stack.doc)?.content }}</pre>
      <template #footer>
        <BaseButton variant="ghost" @click="copy((editing ? draft.doc : stack.doc)?.content ?? '')"><Copy :size="14" /> {{ common.actions.copy }}</BaseButton>
        <BaseButton variant="primary" @click="showDoc = false">{{ common.actions.close }}</BaseButton>
      </template>
    </BaseDialog>

    <!-- ========== MODIFICA (admin) ========== -->
    <form v-if="editing" class="space-y-7" @submit.prevent="save">
      <section class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <span class="label">{{ m.appType }}</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="p in PLATFORMS" :key="p" type="button" class="h-7 rounded-full border px-3 text-[12.5px] font-medium" :class="draft.platforms.includes(p) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2'" :aria-pressed="draft.platforms.includes(p)" @click="togglePlatform(p)">{{ PLATFORM_LABEL[p] }}</button>
          </div>
        </div>
        <div>
          <span class="label">{{ m.languages }}</span>
          <ChipsInput v-model="draft.languages" :placeholder="m.languagesPh" :suggestions="['TypeScript', 'JavaScript', 'C#', 'Rust', 'Python', 'Java', 'Kotlin', 'Swift', 'Dart', 'SQL', 'PHP', 'Go']" />
        </div>
        <div>
          <span class="label">{{ m.frameworksLong }}</span>
          <ChipsInput v-model="draft.frameworks" :placeholder="m.frameworksPh" :suggestions="['Vue 3', 'Tauri', 'Ionic', 'Capacitor', 'React', 'Angular', 'Electron', '.NET', 'WPF', 'WinForms', 'Flutter', 'Supabase', 'Node.js', 'Express', 'Vite', 'Tailwind CSS']" />
        </div>
        <div>
          <label class="label" for="st-repo">{{ m.repo }}</label>
          <input id="st-repo" v-model="draft.repoUrl" class="field font-mono text-[12.5px]" :placeholder="m.repoPh" />
        </div>
        <div>
          <label class="label" for="st-src">{{ m.sourcePathLong }}</label>
          <div class="flex gap-2">
            <input id="st-src" v-model="draft.sourcePath" class="field font-mono text-[12.5px]" :placeholder="m.sourcePh" />
            <BaseButton @click="pickSource"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
          </div>
        </div>
        <div class="md:col-span-2">
          <label class="label" for="st-notes">{{ m.notes }}</label>
          <textarea id="st-notes" v-model="draft.notes" class="field min-h-20 resize-y text-[13.5px]" :placeholder="m.notesPh" />
        </div>
      </section>

      <!-- Prerequisiti -->
      <section>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="label mb-0">{{ m.prereqs }}</span>
          <BaseButton size="sm" variant="ghost" @click="draft.prerequisites.push({ id: newId('pre'), name: '', version: '', url: '', check: '' })"><Plus :size="14" /> {{ m.prereq }}</BaseButton>
        </div>
        <p class="mb-2 text-[12px] text-ink-3">{{ m.prereqsAuto }}</p>
        <div v-if="suggestions.length" class="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
          <Wand2 :size="13" class="text-accent" /> {{ m.suggested }}
          <button v-for="k in suggestions" :key="k.name" type="button" class="flex h-6 items-center gap-1 rounded-full border border-dashed border-accent px-2 font-medium text-accent-ink hover:bg-accent-soft" @click="addKnown([k.name])">
            <Plus :size="11" /> {{ k.name }}
          </button>
        </div>
        <datalist id="known-prereqs"><option v-for="n in knownNames" :key="n" :value="n" /></datalist>
        <div v-for="(p, i) in draft.prerequisites" :key="p.id" class="mb-2 grid grid-cols-[1fr_6rem_1fr_1fr_auto] items-center gap-2">
          <input v-model="p.name" class="field field-sm" :placeholder="m.prereqName" list="known-prereqs" @change="onPrereqName(p)" />
          <input v-model="p.version" class="field field-sm" :placeholder="m.version" />
          <input v-model="p.url" class="field field-sm font-mono text-[12px]" :placeholder="m.downloadUrl" />
          <input v-model="p.check" class="field field-sm font-mono text-[12px]" :placeholder="m.checkCmd" />
          <BaseButton size="icon-sm" variant="ghost" :title="common.actions.remove" @click="removePrereq(i)"><Trash2 :size="14" /></BaseButton>
        </div>
        <p v-if="!draft.prerequisites.length" class="text-[12.5px] text-ink-3">{{ m.prereqsHint }}</p>
      </section>

      <!-- Passi -->
      <section>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="label mb-0">{{ m.steps }}</span>
          <BaseButton size="sm" variant="ghost" @click="draft.steps.push({ id: newId('stp'), title: '', kind: 'command', command: '', cwd: '', url: '', notes: '' })"><Plus :size="14" /> {{ m.step }}</BaseButton>
        </div>
        <div v-for="(st, i) in draft.steps" :key="st.id" class="mb-2 rounded-md border border-line p-3">
          <div class="grid grid-cols-[2rem_1fr_10rem_auto] items-center gap-2">
            <span class="text-center text-[12px] font-bold text-ink-3">{{ i + 1 }}</span>
            <input v-model="st.title" class="field field-sm" :placeholder="m.stepTitle" />
            <select v-model="st.kind" class="field field-sm">
              <option v-for="k in SETUP_STEP_KINDS" :key="k" :value="k">{{ SETUP_STEP_LABEL[k] }}</option>
            </select>
            <span class="flex gap-0.5">
              <BaseButton size="icon-sm" variant="ghost" :title="m.moveUp" :disabled="i === 0" @click="move(draft.steps, i, -1)"><ArrowUp :size="14" /></BaseButton>
              <BaseButton size="icon-sm" variant="ghost" :title="m.moveDown" :disabled="i === draft.steps.length - 1" @click="move(draft.steps, i, 1)"><ArrowDown :size="14" /></BaseButton>
              <BaseButton size="icon-sm" variant="ghost" :title="common.actions.remove" @click="draft.steps.splice(i, 1)"><Trash2 :size="14" /></BaseButton>
            </span>
          </div>
          <div class="mt-2 grid grid-cols-1 gap-2 pl-10 md:grid-cols-[1fr_14rem]">
            <textarea v-if="st.kind === 'command'" v-model="st.command" class="field field-sm min-h-16 resize-y font-mono text-[12px]" :placeholder="m.commands" />
            <input v-else-if="st.kind === 'link'" v-model="st.url" class="field field-sm font-mono text-[12px]" placeholder="https://…" />
            <textarea v-else v-model="st.notes" class="field field-sm min-h-16 resize-y" :placeholder="m.manual" />
            <input v-if="st.kind === 'command'" v-model="st.cwd" class="field field-sm font-mono text-[12px]" :placeholder="m.cwd" />
          </div>
          <input v-if="st.kind !== 'manual'" v-model="st.notes" class="field field-sm mt-2 ml-10 w-[calc(100%-2.5rem)]" :placeholder="m.shortNote" />
        </div>
        <p v-if="!draft.steps.length" class="text-[12.5px] text-ink-3">{{ m.stepsHint }}</p>
      </section>

      <!-- Variabili -->
      <section>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="label mb-0">{{ m.envVars }}</span>
          <BaseButton size="sm" variant="ghost" @click="draft.envVars.push({ key: '', example: '', notes: '' })"><Plus :size="14" /> {{ m.envVar }}</BaseButton>
        </div>
        <div v-for="(v, i) in draft.envVars" :key="i" class="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
          <input v-model="v.key" class="field field-sm font-mono text-[12px]" :placeholder="m.varName" />
          <input v-model="v.example" class="field field-sm font-mono text-[12px]" :placeholder="m.varExample" />
          <input v-model="v.notes" class="field field-sm" :placeholder="m.varNotes" />
          <BaseButton size="icon-sm" variant="ghost" :title="common.actions.remove" @click="draft.envVars.splice(i, 1)"><Trash2 :size="14" /></BaseButton>
        </div>
      </section>

      <!-- File iniziali -->
      <section>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="label mb-0">{{ m.files }}</span>
          <BaseButton size="sm" variant="ghost" @click="draft.files.push({ id: newId('tpl'), path: '', content: '' })"><Plus :size="14" /> {{ m.file }}</BaseButton>
        </div>
        <p class="mb-2 text-[12px] text-ink-3">{{ m.filesHint }}</p>
        <div v-for="(f, i) in draft.files" :key="f.id" class="mb-2 rounded-md border border-line p-3">
          <div class="flex items-center gap-2">
            <FileCode :size="15" class="shrink-0 text-ink-3" />
            <input v-model="f.path" class="field field-sm font-mono text-[12px]" :placeholder="m.filePath" />
            <BaseButton size="icon-sm" variant="ghost" :title="common.actions.remove" @click="draft.files.splice(i, 1)"><Trash2 :size="14" /></BaseButton>
          </div>
          <textarea v-model="f.content" class="field field-sm mt-2 min-h-24 resize-y font-mono text-[12px]" :placeholder="m.fileContent" spellcheck="false" />
        </div>
        <p v-if="!draft.files.length" class="text-[12.5px] text-ink-3">{{ m.filesEmpty }}</p>
      </section>

      <!-- Salvataggio: sempre visibile mentre si modifica -->
      <div class="sticky -bottom-10 z-10 -mx-2 flex items-center gap-2 border-t border-line bg-bg/95 px-2 py-3 backdrop-blur">
        <span class="flex-1 text-[12.5px]" :class="dirty ? 'font-semibold text-p-alta' : 'text-ink-3'">{{ dirty ? m.unsaved : m.noChanges }}</span>
        <BaseButton size="sm" variant="ghost" @click="cancel">{{ common.actions.cancel }}</BaseButton>
        <BaseButton size="sm" variant="primary" type="submit" :title="m.saveHint"><Save :size="14" /> {{ common.actions.save }}</BaseButton>
      </div>
    </form>

    <!-- ========== LETTURA ========== -->
    <template v-else>
      <div v-if="isEmpty" class="max-w-lg rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2">
        <template v-if="canEdit">{{ m.emptyAdmin }}</template>
        <template v-else>{{ m.emptyMember }}</template>
      </div>

      <template v-else>
        <!-- Tecnologie -->
        <section class="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
          <div v-if="view.platforms.length || view.languages.length || view.frameworks.length" class="md:col-span-2 space-y-2">
            <div v-if="view.platforms.length" class="flex flex-wrap items-center gap-1.5 text-[13px]"><span class="w-24 text-ink-3">{{ m.type }}</span><span v-for="p in view.platforms" :key="p" class="rounded-full bg-surface-2 px-2.5 py-0.5 font-medium">{{ PLATFORM_LABEL[p] }}</span></div>
            <div v-if="view.languages.length" class="flex flex-wrap items-center gap-1.5 text-[13px]"><span class="w-24 text-ink-3">{{ m.languages }}</span><span v-for="l in view.languages" :key="l" class="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-ink">{{ l }}</span></div>
            <div v-if="view.frameworks.length" class="flex flex-wrap items-center gap-1.5 text-[13px]"><span class="w-24 text-ink-3">{{ m.frameworks }}</span><span v-for="f in view.frameworks" :key="f" class="rounded-full border border-line px-2.5 py-0.5 font-medium">{{ f }}</span></div>
          </div>
          <div v-if="view.repoUrl" class="text-[13px]">
            <span class="block text-ink-3">{{ m.repo }}</span>
            <span class="flex items-center gap-2"><code class="truncate font-mono text-[12.5px]">{{ view.repoUrl }}</code><BaseButton size="icon-sm" variant="ghost" :title="common.actions.copy" @click="copy(view.repoUrl)"><Copy :size="13" /></BaseButton><BaseButton v-if="/^https?:/.test(view.repoUrl)" size="icon-sm" variant="ghost" :title="common.actions.open" @click="open(view.repoUrl, 'link')"><ExternalLink :size="13" /></BaseButton></span>
          </div>
          <div v-if="view.sourcePath" class="text-[13px]">
            <span class="block text-ink-3">{{ m.sourcePath }}</span>
            <span class="flex items-center gap-2"><code class="truncate font-mono text-[12.5px]">{{ view.sourcePath }}</code><BaseButton size="icon-sm" variant="ghost" :title="m.copyPath" @click="copy(view.sourcePath)"><Copy :size="13" /></BaseButton><BaseButton size="icon-sm" variant="ghost" :title="m.openFolder" @click="open(view.sourcePath, 'file')"><FolderOpen :size="13" /></BaseButton></span>
          </div>
          <p v-if="view.notes" class="md:col-span-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{{ view.notes }}</p>
        </section>

        <!-- Procedura guidata -->
        <section v-if="totalSteps || view.envVars.length || view.files.length" class="rounded-lg border border-line bg-surface p-5">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="text-[15px] font-bold">{{ m.setupTitle }}</h3>
              <p class="text-[12.5px] text-ink-2">{{ m.setupLead(doneCount, totalSteps) }}</p>
              <p v-if="view.prerequisites.length && !checks.busy.value" class="mt-0.5 text-[12.5px] font-medium" :class="prereqStats.action ? 'text-danger' : prereqStats.uncertain ? 'text-p-alta' : 'text-ok'" data-prereq-summary>
                {{ m.prereqSummary(prereqStats.ok, prereqStats.action, prereqStats.uncertain) }}
              </p>
            </div>
            <BaseButton v-if="view.prerequisites.length" size="sm" variant="ghost" :disabled="checks.busy.value" :title="m.recheckHint" @click="checks.checkAll(true)">
              <RefreshCw :size="13" :class="{ 'animate-spin': checks.busy.value }" /> {{ m.recheck }}
            </BaseButton>
            <BaseButton v-if="doneCount" size="sm" variant="ghost" @click="resetProgress">{{ m.restart }}</BaseButton>
            <BaseButton size="sm" variant="primary" :title="m.scriptHint" @click="openAuto"><Play :size="14" /> {{ m.genScript }}</BaseButton>
          </div>
          <div class="mt-3 h-1.5 rounded-full bg-surface-2"><div class="h-full rounded-full bg-ok transition-[width]" :style="{ width: (totalSteps ? (doneCount / totalSteps) * 100 : 0) + '%' }" /></div>

          <ol class="mt-4 space-y-2">
            <li v-for="p in view.prerequisites" :key="p.id" class="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2" :class="{ 'opacity-60': prereqDone(p.id) }" :data-prereq="p.name" :data-status="statusOf(p.id) ?? 'checking'">
              <button
                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-default"
                :class="prereqDone(p.id) ? 'border-ok bg-ok text-white' : needsAction(statusOf(p.id)) ? 'border-danger text-transparent' : 'border-line-strong text-transparent hover:border-ok hover:text-ok'"
                :aria-pressed="prereqDone(p.id)"
                :disabled="prereqLocked(p.id)"
                :title="isSatisfied(statusOf(p.id)) ? m.autoDetected : needsAction(statusOf(p.id)) ? m.installFirst : done.has(p.id) ? m.markTodo : m.confirmInstalled"
                @click="toggleDone(p.id)"
              >
                <Check :size="12" stroke-width="3" />
              </button>
              <div class="min-w-0 flex-1">
                <div class="text-[13.5px] font-semibold">{{ m.prereqNamed(p.name) }} <span v-if="p.version" class="font-normal text-ink-2">{{ p.version }}</span></div>
                <div class="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-medium" :class="statusTone(p.id)" data-check-status>
                  <Loader2 v-if="!statusOf(p.id)" :size="13" class="shrink-0 animate-spin" />
                  <CheckCircle2 v-else-if="isSatisfied(statusOf(p.id))" :size="13" class="shrink-0" />
                  <XCircle v-else-if="needsAction(statusOf(p.id))" :size="13" class="shrink-0" />
                  <MinusCircle v-else-if="statusOf(p.id) === 'unavailable'" :size="13" class="shrink-0" />
                  <AlertTriangle v-else :size="13" class="shrink-0" />
                  <span>{{ statusText(p) }}</span>
                  <span v-if="done.has(p.id) && !prereqLocked(p.id)" class="font-normal text-ink-3">· {{ m.confirmInstalled }}</span>
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <BaseButton v-if="statusOf(p.id) === 'confirm'" size="sm" variant="outline" @click="runCustomCheck(p)"><Play :size="12" /> {{ m.runCheck }}</BaseButton>
                  <code v-if="p.check" class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{{ p.check }}</code>
                  <BaseButton v-if="p.check" size="sm" variant="ghost" @click="copy(p.check, m.cmdCopied)"><Copy :size="12" /> {{ m.copyCheck }}</BaseButton>
                  <BaseButton v-if="p.url" size="sm" :variant="needsAction(statusOf(p.id)) ? 'primary' : 'ghost'" @click="open(p.url, 'link')"><ExternalLink :size="12" /> {{ m.download }}</BaseButton>
                </div>
                <details v-if="checks.results.value[p.id]?.output && !isSatisfied(statusOf(p.id))" class="mt-1 text-[12px] text-ink-3">
                  <summary class="cursor-pointer select-none">{{ m.details }}</summary>
                  <pre class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface-2 px-2 py-1.5 font-mono text-[11.5px]">{{ checks.results.value[p.id]!.command }}&#10;{{ checks.results.value[p.id]!.output }}</pre>
                </details>
              </div>
            </li>
            <li v-for="(st, i) in view.steps" :key="st.id" class="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2" :class="{ 'opacity-60': done.has(st.id) }">
              <button class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors" :class="done.has(st.id) ? 'border-ok bg-ok text-white' : 'border-line-strong text-transparent hover:border-ok hover:text-ok'" :aria-pressed="done.has(st.id)" :title="done.has(st.id) ? m.markTodo : m.markDone" @click="toggleDone(st.id)"><Check :size="12" stroke-width="3" /></button>
              <div class="min-w-0 flex-1">
                <div class="text-[13.5px] font-semibold">{{ i + 1 }}. {{ st.title }} <span class="ml-1 rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-ink-2">{{ SETUP_STEP_LABEL[st.kind] }}</span></div>
                <p v-if="st.notes" class="mt-0.5 text-[12.5px] text-ink-2">{{ st.notes }}</p>
                <div v-if="st.kind === 'command' && st.command" class="mt-1.5 flex items-start gap-2">
                  <pre class="min-w-0 flex-1 overflow-x-auto rounded bg-surface-2 px-2 py-1.5 font-mono text-[12px] leading-relaxed">{{ st.cwd ? `cd ${st.cwd}\n` : '' }}{{ st.command }}</pre>
                  <BaseButton size="sm" variant="ghost" @click="copy((st.cwd ? `cd ${st.cwd}\n` : '') + st.command, m.cmdCopied)"><Copy :size="12" /> {{ common.actions.copy }}</BaseButton>
                </div>
                <BaseButton v-else-if="st.kind === 'link' && st.url" size="sm" variant="ghost" class="mt-1" @click="open(st.url, 'link')"><ExternalLink :size="12" /> {{ st.url }}</BaseButton>
              </div>
            </li>
          </ol>

          <div v-if="view.envVars.length" class="mt-5">
            <h4 class="text-[13px] font-semibold text-ink-2">{{ m.envVars }}</h4>
            <table class="mt-1 w-full text-[12.5px]">
              <tbody class="divide-y divide-line">
                <tr v-for="v in view.envVars" :key="v.key">
                  <td class="py-1 pr-3 font-mono font-semibold">{{ v.key }}</td>
                  <td class="py-1 pr-3 font-mono text-ink-2">{{ v.example || '—' }}</td>
                  <td class="py-1 text-ink-2">{{ v.notes }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="view.files.length" class="mt-5">
            <h4 class="text-[13px] font-semibold text-ink-2">{{ m.files }}</h4>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <code v-for="f in view.files" :key="f.id" class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{{ f.path }}</code>
            </div>
          </div>
        </section>
      </template>
    </template>

    <!-- Configurazione automatica: riepilogo e avvio dello script -->
    <BaseDialog v-model:open="showAuto" :title="m.autoTitle(project.name)" :description="m.autoLead" width="lg">
      <div class="space-y-4 text-[13px]">
        <div>
          <span class="label">{{ m.autoWorkdir }}</span>
          <p v-if="autoDir" class="rounded-md bg-surface-2 px-3 py-2 font-mono text-[12.5px]" data-auto-dir>{{ autoDir }}</p>
          <p v-else class="text-ink-3">{{ m.autoNoWorkdir }}</p>
        </div>
        <div v-if="checks.busy.value" class="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-ink-2"><Loader2 :size="14" class="animate-spin" /> {{ m.autoChecking }}</div>
        <div v-else-if="blockers.length" class="rounded-md border border-danger/40 bg-danger/5 px-3 py-2.5" data-auto-blocked>
          <p class="flex items-center gap-1.5 font-semibold text-danger"><AlertTriangle :size="14" /> {{ m.autoBlocked }}</p>
          <p class="mt-0.5 text-[12.5px] text-ink-2">{{ m.autoBlockedLead }}</p>
          <ul class="mt-1.5 space-y-0.5 text-[12.5px]">
            <li v-for="p in blockers" :key="p.id"><span class="font-semibold">{{ p.name }}</span> — <span :class="statusTone(p.id)">{{ statusText(p) }}</span></li>
          </ul>
        </div>
        <div v-if="view.prerequisites.length">
          <span class="label">{{ m.autoChecks }}</span>
          <ul class="space-y-1">
            <li v-for="p in view.prerequisites" :key="p.id" class="flex items-center gap-2" :class="statusTone(p.id)">
              <Loader2 v-if="!statusOf(p.id)" :size="13" class="shrink-0 animate-spin" />
              <CheckCircle2 v-else-if="prereqDone(p.id)" :size="13" class="shrink-0" />
              <XCircle v-else-if="needsAction(statusOf(p.id))" :size="13" class="shrink-0" />
              <AlertTriangle v-else :size="13" class="shrink-0" />
              <span class="text-ink">{{ p.name }}</span> <span v-if="p.version" class="text-ink-3">{{ p.version }}</span>
              <span class="truncate text-[12px]">· {{ statusText(p) }}</span>
              <code v-if="p.check" class="ml-auto shrink-0 rounded bg-surface-2 px-1.5 font-mono text-[11.5px] text-ink">{{ p.check }}</code>
            </li>
          </ul>
        </div>
        <div v-if="view.steps.length">
          <span class="label">{{ m.autoSteps }}</span>
          <ol class="space-y-1.5">
            <li v-for="(st, i) in view.steps" :key="st.id">
              <span class="font-semibold">{{ i + 1 }}. {{ st.title }}</span>
              <span v-if="st.kind === 'manual'" class="ml-1.5 rounded-full bg-p-media/20 px-1.5 text-[11px] font-medium">{{ m.autoManual }}</span>
              <pre v-if="st.kind === 'command' && st.command" class="mt-0.5 overflow-x-auto rounded bg-surface-2 px-2 py-1 font-mono text-[12px]">{{ st.cwd ? `cd ${st.cwd}\n` : '' }}{{ st.command }}</pre>
              <span v-else-if="st.kind === 'link'" class="ml-1.5 font-mono text-[12px] text-accent-ink">{{ st.url }}</span>
            </li>
          </ol>
        </div>
      </div>
      <template #footer>
        <BaseButton variant="ghost" @click="showAuto = false">{{ common.actions.cancel }}</BaseButton>
        <BaseButton variant="outline" :disabled="autoBlocked" :title="autoBlocked ? m.blockedHint : undefined" @click="downloadScript"><FileDown :size="14" /> {{ m.autoSave }}</BaseButton>
        <BaseButton variant="primary" data-autofocus :disabled="autoBlocked" :title="autoBlocked ? m.blockedHint : undefined" @click="runAuto"><Play :size="14" /> {{ m.autoRun }}</BaseButton>
      </template>
    </BaseDialog>

  </div>
</template>
