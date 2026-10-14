<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Check, Copy, CopyPlus, ExternalLink, FileCode, FileDown, FileText, FileUp, FolderOpen, FolderPlus, Import, Pencil, Plus, Save, Trash2, Wand2 } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ChipsInput from '@/components/ui/ChipsInput.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import ProjectDialog from '@/components/dialogs/ProjectDialog.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs, isTauri } from '@/services/fs'
import { autofillPrerequisite, KNOWN_PREREQUISITES, lookupPrerequisite, suggestPrerequisites } from '@/services/prerequisites'
import { mergeImportedStack, parseStackMarkdown, type ImportCounts } from '@/services/stackDoc'
import { newId } from '@/services/ids'
import { setupScriptWindows } from '@/services/analytics'
import { copyStack, hasStack, projectFolderExists, resolveStack, scaffoldFiles, slugify, varsFor, writeProjectFolder } from '@/services/scaffold'
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
    fill: 'Compila lo stack',
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
    emptyAdmin: 'Nessuna informazione ancora. Compila lo stack: linguaggi, framework, repository, prerequisiti e i passi per configurare il progetto. Gli altri utenti troveranno qui una procedura guidata.',
    emptyMember: 'L’amministratore non ha ancora descritto lo stack di questo progetto.',
    setupTitle: 'Configura sul tuo PC',
    setupLead: (done: number, total: number) => `Segui i passi nell’ordine e spunta quelli fatti: il progresso è tuo, non si vede agli altri. ${done} di ${total} completati.`,
    restart: 'Ricomincia',
    scriptHint: 'Script .cmd che esegue in sequenza verifiche e comandi',
    genScript: 'Genera script Windows',
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
    importFrom: 'Importa da…',
    importTitle: (n: string) => `Sostituire lo stack con quello di «${n}»?`,
    importMessage: 'Le modifiche non salvate vanno perse. Il nome dell’altro progetto viene sostituito con quello di questo progetto; la cartella locale resta.',
    importConfirm: 'Importa',
    imported: (n: string) => `Stack importato da «${n}»: controlla e salva`,
    files: 'File iniziali',
    filesHint: 'File creati nella cartella del progetto con «Crea cartella del progetto». In percorsi e contenuti puoi usare {{name}} (nome del progetto) e {{slug}} (nome per cartelle e URL); vale anche per comandi e link dei passi.',
    file: 'File',
    filePath: 'Percorso, es. package.json o src/main.ts',
    fileContent: 'Contenuto del file',
    filesEmpty: 'Es. package.json, .gitignore, .editorconfig, src/main.ts… README.md, .env.example e lo script di configurazione vengono generati in automatico.',
    newFromStack: 'Nuovo progetto con questo stack',
    newFromStackHint: 'Crea un progetto che parte da questa configurazione: ti verrà chiesto il nome',
    createFolder: 'Crea cartella del progetto',
    createFolderHint: 'Crea sul tuo PC la cartella del progetto con README, .env.example, script di configurazione e file iniziali',
    pickDest: 'Dove creare la cartella del progetto',
    folderTitle: (path: string) => `Creare la cartella ${path}?`,
    folderExists: (path: string) => `La cartella ${path} esiste già: aggiornare i file?`,
    folderMessage: (files: string) => `Verranno scritti: ${files}.`,
    folderExistsMessage: (files: string) => `I file con lo stesso nome vengono sovrascritti, gli altri restano: ${files}.`,
    folderConfirm: 'Crea cartella',
    folderOverwrite: 'Aggiorna i file',
    folderCreated: (n: number) => `Cartella del progetto creata (${n} file)`,
    folderFailed: (err: string) => `Non riesco a creare la cartella: ${err}`,
    folderLinked: 'impostata come cartella del progetto',
    markDone: 'Segna come fatto',
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
    fill: 'Fill in the stack',
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
    emptyAdmin: 'No information yet. Fill in the stack: languages, frameworks, repository, prerequisites and the steps to set up the project. Other users will find a guided procedure here.',
    emptyMember: 'The administrator has not described this project’s stack yet.',
    setupTitle: 'Set up on your PC',
    setupLead: (done: number, total: number) => `Follow the steps in order and tick the ones you have done: your progress is yours only, others cannot see it. ${done} of ${total} completed.`,
    restart: 'Start over',
    scriptHint: '.cmd script that runs checks and commands in sequence',
    genScript: 'Generate Windows script',
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
    importFrom: 'Import from…',
    importTitle: (n: string) => `Replace the stack with the one from “${n}”?`,
    importMessage: 'Unsaved changes are lost. The other project’s name is replaced with this project’s name; the local folder is kept.',
    importConfirm: 'Import',
    imported: (n: string) => `Stack imported from “${n}”: review it and save`,
    files: 'Initial files',
    filesHint: 'Files created in the project folder by “Create project folder”. Paths and contents can use {{name}} (project name) and {{slug}} (name for folders and URLs); this also works in step commands and links.',
    file: 'File',
    filePath: 'Path, e.g. package.json or src/main.ts',
    fileContent: 'File content',
    filesEmpty: 'E.g. package.json, .gitignore, .editorconfig, src/main.ts… README.md, .env.example and the setup script are generated automatically.',
    newFromStack: 'New project with this stack',
    newFromStackHint: 'Create a project that starts from this setup: you will be asked for its name',
    createFolder: 'Create project folder',
    createFolderHint: 'Create the project folder on your PC with README, .env.example, setup script and initial files',
    pickDest: 'Where to create the project folder',
    folderTitle: (path: string) => `Create the folder ${path}?`,
    folderExists: (path: string) => `The folder ${path} already exists: update the files?`,
    folderMessage: (files: string) => `These files will be written: ${files}.`,
    folderExistsMessage: (files: string) => `Files with the same name are overwritten, the others are kept: ${files}.`,
    folderConfirm: 'Create folder',
    folderOverwrite: 'Update files',
    folderCreated: (n: number) => `Project folder created (${n} files)`,
    folderFailed: (err: string) => `Cannot create the folder: ${err}`,
    folderLinked: 'set as the project folder',
    markDone: 'Mark as done',
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

// --- importazione da un altro progetto (modifica, admin) -----------------------------
const importMenu = computed(() =>
  ws.visibleProjects
    .filter((p) => p.id !== props.project.id && hasStack(p.stack))
    .map((p) => ({ label: p.name, onSelect: () => importFrom(p) })),
)
async function importFrom(source: Project) {
  if (hasStack(draft.value) && !(await confirm({ title: m.importTitle(source.name), message: m.importMessage, confirmLabel: m.importConfirm }))) return
  draft.value = { ...copyStack(source.stack, source.name, props.project.name), sourcePath: draft.value.sourcePath }
  ui.toast(m.imported(source.name), 'info', undefined, 4000)
}

// --- nuovo progetto da questo stack e cartella del progetto ---------------------
const showNewProject = ref(false)
async function createFolder() {
  const fs = await getFs()
  const dest = await fs.pickFolder(m.pickDest)
  if (!dest) return
  const files = scaffoldFiles(props.project.name, props.project.description, stack.value)
  const target = await fs.join(dest, slugify(props.project.name))
  const names = files.map((f) => f.path).join(', ')
  const exists = await projectFolderExists(dest, props.project.name)
  const ok = await confirm(
    exists
      ? { title: m.folderExists(target), message: m.folderExistsMessage(names), confirmLabel: m.folderOverwrite, danger: true }
      : { title: m.folderTitle(target), message: m.folderMessage(names), confirmLabel: m.folderConfirm },
  )
  if (!ok) return
  try {
    const root = await writeProjectFolder(dest, props.project.name, files)
    // La prima cartella creata dall'admin diventa la cartella del progetto
    const link = canEdit.value && !stack.value.sourcePath
    if (link) await ws.updateStack(props.project.id, { ...stack.value, sourcePath: root })
    ui.toast(`${m.folderCreated(files.length)}${link ? ` · ${m.folderLinked}` : ''}`, 'success', { label: m.openFolder, run: () => open(root, 'file') }, 6000)
  } catch (e) {
    ui.toast(m.folderFailed(e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
  }
}

async function pickSource() {
  const p = await (await getFs()).pickFolder(m.sourcePath)
  if (p) draft.value.sourcePath = p
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
const doneCount = computed(() => [...stack.value.prerequisites, ...stack.value.steps].filter((x) => done.value.has(x.id)).length)
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
async function downloadScript() {
  const fs = await getFs()
  const name = `setup-${slugify(props.project.name)}.cmd`
  const path = await fs.saveFile(name, m.saveScript)
  if (!path) return
  await fs.writeTextAtomic(path, setupScriptWindows(props.project.name, view.value))
  ui.toast(m.scriptSaved, 'success', { label: m.openFolder, run: () => open(path.replace(/[\\/][^\\/]+$/, ''), 'file') }, 6000)
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
      <template v-if="!editing && !isEmpty">
        <BaseButton size="sm" variant="ghost" :title="m.createFolderHint" @click="createFolder"><FolderPlus :size="14" /> {{ m.createFolder }}</BaseButton>
        <BaseButton v-if="canEdit" size="sm" variant="ghost" :title="m.newFromStackHint" @click="showNewProject = true"><CopyPlus :size="14" /> {{ m.newFromStack }}</BaseButton>
      </template>
      <BaseButton v-if="canEdit" size="sm" variant="ghost" :title="m.importMdHint" @click="importMarkdown"><FileUp :size="14" /> {{ m.importMd }}</BaseButton>
      <input ref="mdInput" type="file" accept=".md,.markdown,.txt,text/markdown" class="hidden" data-md-input @change="onMdFile" />
      <template v-if="canEdit && !editing">
        <BaseButton size="sm" @click="startEdit"><Pencil :size="14" /> {{ isEmpty ? m.fill : common.actions.edit }}</BaseButton>
      </template>
      <template v-else-if="editing">
        <BaseMenu v-if="importMenu.length" :items="importMenu">
          <BaseButton size="sm" variant="ghost"><Import :size="14" /> {{ m.importFrom }}</BaseButton>
        </BaseMenu>
      </template>
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
            </div>
            <BaseButton v-if="doneCount" size="sm" variant="ghost" @click="resetProgress">{{ m.restart }}</BaseButton>
            <BaseButton size="sm" variant="primary" :title="m.scriptHint" @click="downloadScript"><FileDown :size="14" /> {{ m.genScript }}</BaseButton>
          </div>
          <div class="mt-3 h-1.5 rounded-full bg-surface-2"><div class="h-full rounded-full bg-ok transition-[width]" :style="{ width: (totalSteps ? (doneCount / totalSteps) * 100 : 0) + '%' }" /></div>

          <ol class="mt-4 space-y-2">
            <li v-for="p in view.prerequisites" :key="p.id" class="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2" :class="{ 'opacity-60': done.has(p.id) }">
              <button class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors" :class="done.has(p.id) ? 'border-ok bg-ok text-white' : 'border-line-strong text-transparent hover:border-ok hover:text-ok'" :aria-pressed="done.has(p.id)" :title="done.has(p.id) ? m.markTodo : m.markDone" @click="toggleDone(p.id)"><Check :size="12" stroke-width="3" /></button>
              <div class="min-w-0 flex-1">
                <div class="text-[13.5px] font-semibold">{{ m.prereqNamed(p.name) }} <span v-if="p.version" class="font-normal text-ink-2">{{ p.version }}</span></div>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <code v-if="p.check" class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{{ p.check }}</code>
                  <BaseButton v-if="p.check" size="sm" variant="ghost" @click="copy(p.check, m.cmdCopied)"><Copy :size="12" /> {{ m.copyCheck }}</BaseButton>
                  <BaseButton v-if="p.url" size="sm" variant="ghost" @click="open(p.url, 'link')"><ExternalLink :size="12" /> {{ m.download }}</BaseButton>
                </div>
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
              <BaseButton size="sm" variant="ghost" @click="createFolder"><FolderPlus :size="12" /> {{ m.createFolder }}</BaseButton>
            </div>
          </div>
        </section>
      </template>
    </template>

    <ProjectDialog v-model:open="showNewProject" :default-folder-id="project.folderId" :stack-from="project.id" />
  </div>
</template>
