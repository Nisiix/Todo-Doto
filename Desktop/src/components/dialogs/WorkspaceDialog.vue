<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getFs } from '@/services/fs'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import type { WorkspaceMode } from '@/types'
import { Database, FolderGit2, FolderOpen, HardDrive, Loader2, Network } from 'lucide-vue-next'
import { isInside, samePath, scanProjects, type DetectedProject } from '@/services/projectScan'
import { defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Nuovo workspace',
    description: 'Un workspace raccoglie i progetti su cui lavori (da solo o con i colleghi), con le loro cose da fare, lo stack e gli allegati.',
    namePlaceholder: 'Es. Progetti ufficio',
    projectsFolder: 'Cartella dei progetti',
    projectsHint:
      'La cartella in cui si trovano i tuoi progetti (es. D:\\Sviluppo o Z:\\Progetti), oppure quella in cui vuoi crearli. Se contiene già dei progetti, l’app ti propone di aggiungerli al workspace.',
    projectsPlaceholder: 'D:\\Sviluppo oppure Z:\\Progetti',
    pickProjects: 'Scegli la cartella dei progetti',
    dataFolder: 'Cartella Dati Project Goal Manager',
    dataHint:
      'Qui l’app salva i propri dati: elenco dei progetti, task, commenti, cronologia. Deve essere diversa dalla cartella dei progetti, così i dati non si mescolano con i file dei progetti. Per condividere il workspace con i colleghi sceglila in una cartella di rete.',
    pickData: 'Scegli la cartella Dati Project Goal Manager',
    useSuggested: (p: string) => `Usa ${p}`,
    scanning: 'Cerco progetti nella cartella…',
    found: (n: number) => `Questa cartella contiene ${n} ${plural(n, 'progetto', 'progetti')}`,
    foundHint: 'Il nome di ciascun progetto sarà quello della sua cartella; lo Stack si compila dai suoi file (repository, linguaggi, framework, README).',
    noneFound: 'Nessun progetto trovato: la cartella verrà usata per i progetti che creerai.',
    importAll: 'Crea i progetti nel workspace',
    selectAll: 'Tutti',
    selectNone: 'Nessuno',
    where: 'Chi usa il workspace',
    local: 'Solo su questo PC',
    localHint: 'Nessuna password, sei tu l’unico utente.',
    network: 'Condiviso in rete',
    networkHint: 'Cartella Dati su un server; i colleghi entrano con una password.',
    password: 'Password di accesso',
    repeatPassword: 'Ripeti password',
    adminHint: 'Tu sarai amministratore. Chi apre la cartella Dati da un altro PC dovrà inserire la password una sola volta.',
    create: 'Crea workspace',
    errName: 'Dai un nome al workspace.',
    errProjects: 'Indica la cartella dei progetti (dove si trovano o dove vuoi crearli).',
    errData: 'Indica la cartella Dati Project Goal Manager, diversa da quella dei progetti.',
    errSame: 'La cartella Dati Project Goal Manager deve essere diversa dalla cartella dei progetti.',
    errInside: (n: string) => `La cartella Dati Project Goal Manager non può stare dentro il progetto «${n}».`,
    notAWorkspace: (n: number) => `La cartella scelta non è un workspace ma contiene ${n} ${plural(n, 'progetto', 'progetti')}: crea un workspace per gestirli.`,
    importing: (done: number, total: number) => `Creo i progetti… ${done} di ${total}`,
    imported: (n: number) => `${n} ${plural(n, 'progetto creato', 'progetti creati')} dalla cartella`,
  },
  en: {
    title: 'New workspace',
    description: 'A workspace gathers the projects you work on (alone or with colleagues), with their to-dos, stack and attachments.',
    namePlaceholder: 'E.g. Office projects',
    projectsFolder: 'Projects folder',
    projectsHint:
      'The folder where your projects are (e.g. D:\\Dev or Z:\\Projects), or the one where you want to create them. If it already contains projects, the app offers to add them to the workspace.',
    projectsPlaceholder: 'D:\\Dev or Z:\\Projects',
    pickProjects: 'Choose the projects folder',
    dataFolder: 'Project Goal Manager data folder',
    dataHint:
      'This is where the app stores its own data: project list, tasks, comments, activity log. It must be different from the projects folder, so the data does not mix with the project files. To share the workspace with colleagues, choose a network folder.',
    pickData: 'Choose the Project Goal Manager data folder',
    useSuggested: (p: string) => `Use ${p}`,
    scanning: 'Looking for projects in the folder…',
    found: (n: number) => `This folder contains ${n} ${plural(n, 'project', 'projects')}`,
    foundHint: 'Each project is named after its folder; the Stack is filled in from its files (repository, languages, frameworks, README).',
    noneFound: 'No projects found: the folder will be used for the projects you create.',
    importAll: 'Create the projects in the workspace',
    selectAll: 'All',
    selectNone: 'None',
    where: 'Who uses the workspace',
    local: 'Only on this PC',
    localHint: 'No password, you are the only user.',
    network: 'Shared on the network',
    networkHint: 'Data folder on a server; colleagues join with a password.',
    password: 'Access password',
    repeatPassword: 'Repeat password',
    adminHint: 'You will be the administrator. Whoever opens the data folder from another PC enters the password only once.',
    create: 'Create workspace',
    errName: 'Give the workspace a name.',
    errProjects: 'Enter the projects folder (where they are or where you want to create them).',
    errData: 'Enter the Project Goal Manager data folder, different from the projects folder.',
    errSame: 'The Project Goal Manager data folder must be different from the projects folder.',
    errInside: (n: string) => `The Project Goal Manager data folder cannot be inside the project “${n}”.`,
    notAWorkspace: (n: number) => `The selected folder is not a workspace but contains ${n} ${plural(n, 'project', 'projects')}: create a workspace to manage them.`,
    importing: (done: number, total: number) => `Creating the projects… ${done} of ${total}`,
    imported: (n: number) => `${n} ${plural(n, 'project', 'projects')} created from the folder`,
  },
})

/**
 * Creazione di un workspace con due cartelle distinte: quella dei progetti
 * (dove si trovano o verranno creati) e la cartella Dati Project Goal Manager
 * (i file dell'app). Se la cartella dei progetti contiene già dei progetti,
 * propone di crearli nel workspace.
 * `presetFolder`: cartella dei progetti già scelta (es. con "Apri cartella").
 */
const props = defineProps<{ presetFolder?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ opened: []; needsPassword: [] }>()
const ws = useWorkspaceStore()
const ui = useUiStore()

const name = ref('')
const path = ref('') // cartella dei progetti
const dataPath = ref('') // cartella Dati Project Goal Manager
const mode = ref<WorkspaceMode>('local')
const password = ref('')
const password2 = ref('')
const error = ref('')
const busy = ref(false)
const progress = ref('')

// --- progetti già presenti nella cartella e cartella Dati suggerita -------------------
const scanning = ref(false)
const scanned = ref(false)
const found = ref<DetectedProject[]>([])
const selected = ref(new Set<string>())
const importEnabled = ref(true)
const suggested = ref('')
let scanSeq = 0
async function scan(folder: string) {
  const seq = ++scanSeq
  found.value = []
  scanned.value = false
  suggested.value = ''
  const clean = folder.trim().replace(/[\\/]+$/, '')
  if (!clean) return
  scanning.value = true
  try {
    const fs = await getFs()
    const list = await scanProjects(clean)
    // Suggerimento per i dati: accanto alla cartella dei progetti, con un nome riconoscibile
    const parent = clean.replace(/[\\/][^\\/]*$/, '')
    const base = clean.split(/[\\/]/).pop() || 'Progetti'
    const sugg = parent && parent !== clean ? await fs.join(parent, `${base} - Project Goal Manager`) : await fs.join(clean, 'Project Goal Manager')
    if (seq !== scanSeq) return
    found.value = list
    selected.value = new Set(list.map((p) => p.path))
    suggested.value = sugg
    scanned.value = true
  } catch {
    if (seq === scanSeq) found.value = []
  } finally {
    if (seq === scanSeq) scanning.value = false
  }
}
watchDebounced(() => [open.value, path.value] as const, ([o, p]) => o && void scan(p), { debounce: 350 })
const hasProjects = computed(() => found.value.length > 0)
const toImport = computed(() => (importEnabled.value ? found.value.filter((p) => selected.value.has(p.path)) : []))
function toggle(p: DetectedProject) {
  const next = new Set(selected.value)
  next.has(p.path) ? next.delete(p.path) : next.add(p.path)
  selected.value = next
}
const setAll = (on: boolean) => (selected.value = new Set(on ? found.value.map((p) => p.path) : []))

watch(open, (o) => {
  if (!o) return
  name.value = props.presetFolder ? (props.presetFolder.split(/[\\/]/).filter(Boolean).pop() ?? '') : ''
  path.value = props.presetFolder ?? ''
  dataPath.value = ''
  found.value = []
  scanned.value = false
  importEnabled.value = true
  progress.value = ''
  mode.value = 'local'
  password.value = ''
  password2.value = ''
  error.value = ''
})

async function pickProjects() {
  const p = await (await getFs()).pickFolder(m.pickProjects)
  if (p) {
    path.value = p
    if (!name.value) name.value = p.split(/[\\/]/).filter(Boolean).pop() ?? ''
  }
}
async function pickData() {
  const p = await (await getFs()).pickFolder(m.pickData)
  if (p) dataPath.value = p
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) return (error.value = m.errName)
  if (!path.value.trim()) return (error.value = m.errProjects)
  if (!dataPath.value.trim()) return (error.value = m.errData)
  if (samePath(dataPath.value, path.value)) return (error.value = m.errSame)
  const inside = found.value.find((p) => isInside(dataPath.value, p.path))
  if (inside) return (error.value = m.errInside(inside.name))
  if (mode.value === 'network') {
    if (password.value.length < 6) return (error.value = common.password.tooShort)
    if (password.value !== password2.value) return (error.value = common.password.mismatch)
  }
  busy.value = true
  const r = await ws.create({ path: dataPath.value.trim(), projectsPath: path.value.trim(), name: name.value, mode: mode.value, password: password.value })
  if (r.ok && toImport.value.length) {
    const n = await ws.importProjects(toImport.value, (done, total) => (progress.value = m.importing(done, total)))
    ui.toast(m.imported(n), 'success', undefined, 4000)
  }
  busy.value = false
  progress.value = ''
  if (r.ok) {
    open.value = false
    emit('opened')
  } else if ('error' in r) error.value = r.error
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description">
    <form class="space-y-4" @submit.prevent="submit">
      <p v-if="presetFolder && hasProjects" class="rounded-md bg-accent-soft px-3 py-2 text-[12.5px] text-accent-ink">{{ m.notAWorkspace(found.length) }}</p>
      <div>
        <label class="label" for="ws-name">{{ common.name }}</label>
        <input id="ws-name" v-model="name" class="field" :placeholder="m.namePlaceholder" data-autofocus />
      </div>

      <!-- Cartella dei progetti -->
      <div>
        <label class="label flex items-center gap-1.5" for="ws-path"><FolderGit2 :size="14" class="text-accent" /> {{ m.projectsFolder }}</label>
        <div class="flex gap-2">
          <input id="ws-path" v-model="path" class="field font-mono text-[12.5px]" :placeholder="m.projectsPlaceholder" />
          <BaseButton :aria-label="m.pickProjects" @click="pickProjects"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.projectsHint }}</p>
        <p v-if="scanning" class="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-3"><Loader2 :size="12" class="animate-spin" /> {{ m.scanning }}</p>
        <p v-else-if="scanned && !hasProjects" class="mt-1.5 text-[12px] text-ink-2">{{ m.noneFound }}</p>
      </div>

      <!-- Progetti trovati nella cartella -->
      <div v-if="hasProjects" class="rounded-md border border-line p-3" data-found-projects>
        <div class="flex items-center gap-2 text-[13px] font-semibold">
          <FolderGit2 :size="15" class="text-accent" /> {{ m.found(found.length) }}
        </div>
        <p class="mt-0.5 text-[12px] text-ink-3">{{ m.foundHint }}</p>
        <label class="mt-2 flex items-center gap-2 text-[13px]">
          <input v-model="importEnabled" type="checkbox" class="accent-accent" /> {{ m.importAll }}
          <span v-if="importEnabled" class="ml-auto flex gap-2 text-[12px]">
            <button type="button" class="text-accent-ink hover:underline" @click="setAll(true)">{{ m.selectAll }}</button>
            <button type="button" class="text-accent-ink hover:underline" @click="setAll(false)">{{ m.selectNone }}</button>
          </span>
        </label>
        <ul v-if="importEnabled" class="mt-1.5 max-h-40 divide-y divide-line overflow-y-auto rounded border border-line">
          <li v-for="p in found" :key="p.path">
            <label class="flex items-center gap-2 px-2 py-1.5 text-[13px] hover:bg-surface-2">
              <input type="checkbox" class="accent-accent" :checked="selected.has(p.path)" @change="toggle(p)" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ p.name }}</span>
              <span class="shrink-0 truncate font-mono text-[11px] text-ink-3">{{ p.markers.slice(0, 3).join(' · ') }}</span>
            </label>
          </li>
        </ul>
      </div>

      <!-- Cartella Dati Project Goal Manager -->
      <div>
        <label class="label flex items-center gap-1.5" for="ws-data"><Database :size="14" class="text-accent" /> {{ m.dataFolder }}</label>
        <div class="flex gap-2">
          <input id="ws-data" v-model="dataPath" class="field font-mono text-[12.5px]" />
          <BaseButton :aria-label="m.pickData" @click="pickData"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.dataHint }}</p>
        <button v-if="suggested && !samePath(suggested, dataPath)" type="button" class="mt-1 max-w-full truncate text-left font-mono text-[12px] text-accent-ink hover:underline" @click="dataPath = suggested">
          {{ m.useSuggested(suggested) }}
        </button>
      </div>

      <div>
        <span class="label">{{ m.where }}</span>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors"
            :class="mode === 'local' ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2'"
            @click="mode = 'local'"
          >
            <HardDrive :size="18" class="mt-0.5 shrink-0 text-accent" />
            <span>
              <span class="block font-semibold">{{ m.local }}</span>
              <span class="block text-[12.5px] text-ink-2">{{ m.localHint }}</span>
            </span>
          </button>
          <button
            type="button"
            class="flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors"
            :class="mode === 'network' ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2'"
            @click="mode = 'network'"
          >
            <Network :size="18" class="mt-0.5 shrink-0 text-accent" />
            <span>
              <span class="block font-semibold">{{ m.network }}</span>
              <span class="block text-[12.5px] text-ink-2">{{ m.networkHint }}</span>
            </span>
          </button>
        </div>
      </div>
      <div v-if="mode === 'network'" class="grid grid-cols-2 gap-2">
        <div>
          <label class="label" for="ws-pw">{{ m.password }}</label>
          <input id="ws-pw" v-model="password" type="password" class="field" autocomplete="new-password" />
        </div>
        <div>
          <label class="label" for="ws-pw2">{{ m.repeatPassword }}</label>
          <input id="ws-pw2" v-model="password2" type="password" class="field" autocomplete="new-password" />
        </div>
        <p class="col-span-2 text-[12.5px] text-ink-2">{{ m.adminHint }}</p>
      </div>
      <p v-if="progress" class="flex items-center gap-1.5 text-[13px] text-ink-2"><Loader2 :size="13" class="animate-spin" /> {{ progress }}</p>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="busy" @click="submit">{{ m.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
