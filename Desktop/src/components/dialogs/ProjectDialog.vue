<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import { FolderGit2, FolderOpen, FolderPlus, HardDrive, Loader2, AlertTriangle } from 'lucide-vue-next'
import { getFs } from '@/services/fs'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ProjectAccessFields, { resolveMembers } from '@/components/project/ProjectAccessFields.vue'
import type { Visibility } from '@/types'
import { useWorkspaceStore } from '@/stores/workspace'
import { copyStack, hasStack, scaffoldFiles, writeProjectFolderAt } from '@/services/scaffold'
import { checkFolder, explainFsError } from '@/services/fsErrors'
import { detectStack, inspectFolder, samePath, type FolderKind } from '@/services/projectScan'
import { useUiStore } from '@/stores/ui'
import { checkShare, projectParts, projectShareText, shareState } from '@/services/sharing'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    errName: 'Il progetto ha bisogno di un nome.',
    errFolder: 'Indica la cartella del progetto sul disco.',
    localOnlyAdmins: 'Per ora lo vedono solo gli amministratori.',
    newProject: 'Nuovo progetto',
    namePlaceholder: 'Es. Progetto di test',
    nameHint: 'Il nome del progetto è il nome della sua cartella e dopo la creazione non si cambia più. Scrivendolo qui, la cartella viene proposta dentro la cartella dei progetti.',
    diskPath: 'Cartella del progetto sul disco',
    diskHint: 'Scegli la cartella di un progetto esistente (di qualunque tipo o linguaggio) per importarlo così com’è, oppure una cartella vuota o nuova per creare il progetto da zero.',
    pickDisk: 'Scegli la cartella del progetto',
    checking: 'Controllo la cartella…',
    kindProject: (markers: string) => `Progetto esistente riconosciuto (${markers}): verrà importato così com’è, la cartella non viene modificata.`,
    importStructure: 'Importa la struttura del progetto: linguaggi, framework, repository, prerequisiti, passi e README',
    kindNew: 'La cartella non esiste: verrà creata con il progetto, con README, .env.example, script di configurazione e i file iniziali dello stack.',
    kindEmpty: 'Cartella vuota: il progetto viene creato da zero, con README, .env.example, script di configurazione e i file iniziali dello stack.',
    kindOther: 'La cartella contiene dei file ma non un progetto riconoscibile. Per creare un progetto da zero la cartella deve essere vuota (o non esistere ancora); per importarne uno, scegli la cartella del progetto.',
    kindWorkspace: 'Questa è la cartella Dati di un workspace di Todo Doto, non la cartella di un progetto.',
    kindProjects: (names: string) => `Questa è una cartella che contiene più progetti (${names}), non la cartella di un singolo progetto: scegli la cartella di uno solo. Per acquisire più progetti insieme usa la cartella dei progetti del workspace.`,
    kindProjectsRoot: 'Questa è la cartella dei progetti del workspace, che li contiene tutti: scegli la cartella di un singolo progetto (o scrivi il nome per crearne uno nuovo dentro di essa).',
    folderCreated: (n: number) => `Cartella del progetto creata (${n} file)`,
    folderFailed: (err: string) => `Progetto creato, ma la cartella non è stata creata: ${err}`,
    imported: 'Progetto importato: stack ricavato dai file della cartella',
    detectFailed: (err: string) => `Progetto creato, ma non riesco a leggerne i file per ricavare lo stack: ${err}. Riprova dalla sezione Stack con «Rileva dai file del progetto».`,
    create: 'Crea progetto',
    importCreate: 'Importa progetto',
    stackFrom: 'Stack e configurazione iniziale',
    emptyStack: 'Vuoto',
    copyFrom: (n: string) => `Copia da «${n}»`,
    stackHint: 'Copia tecnologie, prerequisiti, passi, variabili e file iniziali; il nome del progetto di origine diventa quello nuovo.',
  },
  en: {
    errName: 'The project needs a name.',
    errFolder: 'Set the project folder on disk.',
    localOnlyAdmins: 'For now only administrators can see it.',
    newProject: 'New project',
    namePlaceholder: 'E.g. Test project',
    nameHint: 'The project name is the name of its folder and cannot be changed after creation. Typing it here suggests a folder inside the projects folder.',
    diskPath: 'Project folder on disk',
    diskHint: 'Choose the folder of an existing project (of any type or language) to import it as it is, or an empty or new folder to create the project from scratch.',
    pickDisk: 'Choose the project folder',
    checking: 'Checking the folder…',
    kindProject: (markers: string) => `Existing project recognized (${markers}): it will be imported as it is, the folder is not changed.`,
    importStructure: 'Import the project structure: languages, frameworks, repository, prerequisites, steps and README',
    kindNew: 'The folder does not exist: it will be created with the project, with README, .env.example, setup script and the stack’s initial files.',
    kindEmpty: 'Empty folder: the project is created from scratch, with README, .env.example, setup script and the stack’s initial files.',
    kindOther: 'The folder contains files but not a recognizable project. To create a project from scratch the folder must be empty (or not exist yet); to import one, choose the project’s folder.',
    kindWorkspace: 'This is the data folder of a Todo Doto workspace, not a project folder.',
    kindProjects: (names: string) => `This folder contains several projects (${names}), not a single project’s folder: choose the folder of one of them. To acquire several projects at once use the workspace projects folder.`,
    kindProjectsRoot: 'This is the workspace projects folder, which contains them all: choose a single project’s folder (or type a name to create a new one inside it).',
    folderCreated: (n: number) => `Project folder created (${n} files)`,
    folderFailed: (err: string) => `Project created, but the folder was not created: ${err}`,
    imported: 'Project imported: stack derived from the folder’s files',
    detectFailed: (err: string) => `Project created, but its files cannot be read to derive the stack: ${err}. Try again from the Stack section with “Detect from the project files”.`,
    create: 'Create project',
    importCreate: 'Import project',
    stackFrom: 'Stack and initial setup',
    emptyStack: 'Empty',
    copyFrom: (n: string) => `Copy from “${n}”`,
    stackHint: 'Copies technologies, prerequisites, steps, variables and initial files; the source project name becomes the new one.',
  },
})

/**
 * Creazione di un progetto, partendo dalla cartella sul disco (il nome è
 * quello della cartella e non si cambia più):
 *  - cartella di un progetto esistente, di qualunque tipo o linguaggio: lo si
 *    importa così com'è, ricavandone lo stack (facoltativo);
 *  - cartella vuota o non ancora esistente: il progetto nasce da zero, con i
 *    file iniziali (README, script di configurazione, file dello stack);
 *  - cartella con altri file: errore, per partire da zero dev'essere vuota.
 * Chi vede il progetto si cambia poi da Membri › Gestione permessi.
 */
const props = defineProps<{ defaultFolderId?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const router = useRouter()
const ui = useUiStore()

const name = ref('')
const visibility = ref<Visibility>('public')
const members = ref<string[]>([])
const error = ref('')
const stackSource = ref<string | null>(null)
/** Progetti con uno stack da usare come modello (solo per gli admin). */
const templates = computed(() => (ws.isAdmin ? ws.visibleProjects.filter((p) => hasStack(p.stack)) : []))

// Cartella del progetto sul disco e nome vanno insieme: il nome è l'ultima parte del percorso.
const diskPath = ref('')
const folderName = (path: string) => path.split(/[\\/]+/).filter(Boolean).pop() ?? ''
/** Scrivendo il nome: <cartella dei progetti>/<nome> (o, con una cartella scelta, nella stessa cartella madre). */
watch(name, async (n) => {
  const current = diskPath.value.trim()
  // Il nome arriva già dalla cartella (scelta o scritta): niente da fare
  if (!open.value || n.trim() === folderName(current)) return
  const parent = current ? current.slice(0, current.length - folderName(current).length).replace(/[\\/]+$/, '') : ''
  const root = parent || ws.projectsRoot
  if (!root) return
  diskPath.value = n.trim() ? await (await getFs()).join(root, n.trim()) : ''
})
/** Cambiando la cartella: il nome diventa quello della cartella. */
function syncName() {
  name.value = folderName(diskPath.value.trim())
}
async function pickDisk() {
  const p = await (await getFs()).pickFolder(m.pickDisk)
  if (p) {
    diskPath.value = p
    syncName()
  }
}

// --- che cosa c'è nella cartella scelta -------------------------------------------
const kind = ref<FolderKind | null>(null)
const markers = ref<string[]>([])
/** Problema della cartella (rete non raggiungibile, permessi, già collegata…). */
const folderProblem = ref('')
const inspecting = ref(false)
/** Progetto esistente: se ne ricava lo stack dai file (si può evitare). */
const importStructure = ref(true)
let seq = 0
async function inspect(path: string) {
  const n = ++seq
  const dir = path.trim()
  kind.value = null
  markers.value = []
  folderProblem.value = ''
  if (!dir) return
  inspecting.value = true
  try {
    // Un progetto per cartella: se la cartella è già di un progetto (anche nel cestino) non se ne crea un altro
    const linked = ws.projectAtPath(dir)
    // La cartella dei progetti del workspace non è la cartella di un progetto
    const problem = ws.projectsRoot && samePath(dir, ws.projectsRoot)
      ? m.kindProjectsRoot
      : linked ? common.ws.duplicateFolder(linked.name, !!linked.trashedAt) : await checkFolder(await getFs(), dir, { write: true })
    if (n !== seq) return
    if (problem) return (folderProblem.value = problem)
    const r = await inspectFolder(dir)
    if (n !== seq) return
    kind.value = r.kind
    markers.value = r.markers
  } catch (e) {
    if (n === seq) folderProblem.value = explainFsError(e, dir)
  } finally {
    if (n === seq) inspecting.value = false
  }
}
watchDebounced(() => [open.value, diskPath.value] as const, ([o, p]) => o && void inspect(p), { debounce: 300 })
// Visibilità ad altri membri solo con la cartella Dati e la cartella del progetto in rete
const dataPath = computed(() => ws.storage?.root ?? '')
// (prima di scrivere il nome la cartella sarà dentro quella dei progetti: conta quella)
const folderForShare = computed(() => diskPath.value.trim() || ws.projectsRoot)
const share = computed(() => (ws.isNetwork && folderForShare.value ? shareState(projectParts(dataPath.value, folderForShare.value)) : null))
const shareText = computed(() => (share.value ? projectShareText(share.value) : ''))
const isImport = computed(() => kind.value === 'project')
const blocked = computed(() => !!folderProblem.value || kind.value === 'other' || kind.value === 'workspace' || kind.value === 'projects')

watch(open, (o) => {
  if (!o) return
  diskPath.value = ''
  name.value = ''
  members.value = []
  visibility.value = 'public'
  error.value = ''
  stackSource.value = null
  importStructure.value = true
  kind.value = null
  folderProblem.value = ''
})

async function submit() {
  error.value = ''
  const dir = diskPath.value.trim()
  // Il nome è sempre quello della cartella, quando c'è
  if (dir) name.value = folderName(dir)
  if (!name.value.trim()) return (error.value = m.errName)
  if (!dir && ws.projectsRoot) return (error.value = m.errFolder)
  // Esito della cartella aggiornato (l'utente può aver appena scritto il percorso)
  await inspect(dir)
  if (folderProblem.value) return (error.value = `${m.diskPath}: ${folderProblem.value}`)
  if (kind.value === 'other') return (error.value = m.kindOther)
  if (kind.value === 'workspace') return (error.value = m.kindWorkspace)
  if (kind.value === 'projects') return (error.value = m.kindProjects(markers.value.slice(0, 4).join(', ')))

  // Visibilità: conta solo nei workspace di rete (in locale c'è un solo utente). Con le
  // cartelle in locale gli altri non raggiungerebbero il progetto: lo vedono solo gli amministratori.
  const shareable = ws.isNetwork && (await checkShare(projectParts(dataPath.value, dir))).ok
  const vis: Visibility = !ws.isNetwork ? 'public' : shareable ? visibility.value : 'restricted'
  const memberIds = shareable ? resolveMembers(ws.users, vis, members.value) : []
  const importing = kind.value === 'project'
  // Progetto esistente: stack ricavato dai suoi file
  let detected: Awaited<ReturnType<typeof detectStack>> | null = null
  if (importing && importStructure.value) {
    try {
      detected = await detectStack(dir)
    } catch (e) {
      // La cartella c'è ma non si legge (rete, permessi): il progetto si crea comunque, lo si dice
      ui.toast(m.detectFailed(explainFsError(e, dir)), 'warning', undefined, 8000)
    }
  }
  // Il progetto nasce nella cartella della barra laterale da cui lo si crea (o alla radice)
  const p = await ws.createProject({ name: name.value, description: detected?.description ?? '', folderId: props.defaultFolderId ?? null, members: memberIds, visibility: vis })
  if (!p) return
  const source = !importing && stackSource.value ? ws.projects[stackSource.value] : null
  if (detected) await ws.updateStack(p.id, { ...detected.stack, sourcePath: dir })
  else if (source) await ws.updateStack(p.id, copyStack(source.stack, source.name, p.name))
  if (dir) {
    if (!detected) await ws.setProjectSourcePath(p.id, dir)
    if (importing && detected) ui.toast(m.imported, 'success', undefined, 3000)
    else {
      // Cartella nuova o vuota: la si prepara subito con README, script di configurazione e file iniziali
      const files = scaffoldFiles(p.name, p.description, ws.projects[p.id]?.stack ?? p.stack)
      try {
        await writeProjectFolderAt(dir, files)
        ui.toast(m.folderCreated(files.length), 'success', undefined, 3000)
      } catch (e) {
        ui.toast(m.folderFailed(explainFsError(e, dir)), 'error', undefined, 8000)
      }
    }
  }
  router.push({ name: 'project', params: { id: p.id, section: source || detected ? 'stack' : '' } })
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.newProject">
    <form class="space-y-4" @submit.prevent="submit">
      <!-- Prima la cartella: decide se il progetto si importa o nasce da zero -->
      <div>
        <label class="label" for="p-disk">{{ m.diskPath }}</label>
        <div class="flex gap-2">
          <input id="p-disk" v-model="diskPath" class="field font-mono text-[12.5px]" data-autofocus @input="syncName" />
          <BaseButton :aria-label="m.pickDisk" @click="pickDisk"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.diskHint }}</p>
        <div class="mt-2" data-folder-kind :data-kind="folderProblem ? 'error' : (kind ?? '')">
          <p v-if="inspecting" class="flex items-center gap-1.5 text-[12px] text-ink-3"><Loader2 :size="12" class="animate-spin" /> {{ m.checking }}</p>
          <p v-else-if="folderProblem" class="flex items-start gap-1.5 text-[12.5px] text-danger"><AlertTriangle :size="14" class="mt-0.5 shrink-0" /> {{ folderProblem }}</p>
          <div v-else-if="kind === 'project'" class="rounded-md border border-accent/40 bg-accent-soft/40 px-3 py-2">
            <p class="flex items-start gap-1.5 text-[12.5px] text-ink"><FolderGit2 :size="14" class="mt-0.5 shrink-0 text-accent" /> {{ m.kindProject(markers.slice(0, 4).join(', ')) }}</p>
            <label class="mt-1.5 flex items-start gap-2 text-[12.5px] text-ink-2">
              <input v-model="importStructure" type="checkbox" class="mt-0.5 accent-accent" /> {{ m.importStructure }}
            </label>
          </div>
          <p v-else-if="kind === 'missing' || kind === 'empty'" class="flex items-start gap-1.5 text-[12.5px] text-ink-2">
            <FolderPlus :size="14" class="mt-0.5 shrink-0 text-ok" /> {{ kind === 'missing' ? m.kindNew : m.kindEmpty }}
          </p>
          <p v-else-if="kind === 'other' || kind === 'workspace' || kind === 'projects'" class="flex items-start gap-1.5 text-[12.5px] text-danger">
            <AlertTriangle :size="14" class="mt-0.5 shrink-0" />
            {{ kind === 'other' ? m.kindOther : kind === 'workspace' ? m.kindWorkspace : m.kindProjects(markers.slice(0, 4).join(', ')) }}
          </p>
        </div>
      </div>
      <div>
        <label class="label" for="p-name">{{ common.name }}</label>
        <input id="p-name" v-model="name" class="field" :placeholder="m.namePlaceholder" />
        <p class="mt-1 text-[12px] text-ink-3" data-name-hint>{{ m.nameHint }}</p>
      </div>
      <div v-if="templates.length && !isImport">
        <label class="label" for="p-stack">{{ m.stackFrom }}</label>
        <select id="p-stack" v-model="stackSource" class="field">
          <option :value="null">{{ m.emptyStack }}</option>
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ m.copyFrom(t.name) }}</option>
        </select>
        <p v-if="stackSource" class="mt-1 text-[12px] text-ink-3">{{ m.stackHint }}</p>
      </div>

      <template v-if="ws.isNetwork && ws.isAdmin">
        <p v-if="shareText" class="flex items-start gap-1.5 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2" data-share-blocked>
          <HardDrive :size="14" class="mt-0.5 shrink-0 text-p-alta" /> <span>{{ shareText }} {{ m.localOnlyAdmins }}</span>
        </p>
        <ProjectAccessFields v-else-if="share?.ok" v-model:visibility="visibility" v-model:members="members" />
      </template>

      <p v-if="error" class="text-[13px] text-danger" data-project-error>{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="blocked || inspecting" @click="submit">{{ isImport ? m.importCreate : m.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
