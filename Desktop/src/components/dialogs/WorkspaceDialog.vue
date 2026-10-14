<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getFs } from '@/services/fs'
import { useWorkspaceStore } from '@/stores/workspace'
import type { WorkspaceMode } from '@/types'
import { FolderGit2, FolderOpen, HardDrive, Loader2, Network } from 'lucide-vue-next'
import { isInside, samePath, scanProjects, type DetectedProject } from '@/services/projectScan'
import { useUiStore } from '@/stores/ui'
import { plural } from '@/i18n'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    pickFolder: 'Scegli la cartella del workspace',
    errName: 'Dai un nome al workspace.',
    errFolder: 'Scegli una cartella.',
    title: 'Nuovo workspace',
    description: 'Un workspace è una cartella che contiene cartelle e progetti.',
    namePlaceholder: 'Es. Roadmap sviluppo',
    folder: 'Cartella',
    folderPlaceholder: 'D:\\Roadmap oppure Z:\\Condivisa\\Roadmap',
    where: 'Dove vivono i dati',
    local: 'Solo su questo PC',
    localHint: 'Nessuna password, sei tu l’unico utente.',
    network: 'Condiviso in rete',
    networkHint: 'Cartella su server; i colleghi entrano con una password.',
    password: 'Password di accesso',
    repeatPassword: 'Ripeti password',
    adminHint: 'Tu sarai amministratore. Chi apre la cartella da un altro PC dovrà inserire la password una sola volta.',
    create: 'Crea workspace',
    projectsFolder: 'Cartella dei progetti',
    scanning: 'Cerco progetti nella cartella…',
    found: (n: number) => `Questa cartella contiene ${n} ${plural(n, 'progetto', 'progetti')}`,
    foundHint: 'Il nome di ciascun progetto sarà quello della sua cartella; lo Stack si compila dai suoi file (repository, linguaggi, framework, README).',
    importAll: 'Crea i progetti nel workspace',
    selectAll: 'Tutti',
    selectNone: 'Nessuno',
    wsFolder: 'Cartella del workspace (dati di Project Goal Manager)',
    wsFolderHint: 'I file del workspace non vanno mescolati con quelli dei progetti: scegli una cartella diversa.',
    useSuggested: (p: string) => `Usa ${p}`,
    pickWsFolder: 'Scegli dove salvare il workspace',
    errWsFolder: 'Scegli una cartella diversa da quella dei progetti in cui salvare il workspace.',
    errWsSame: 'La cartella del workspace deve essere diversa da quella dei progetti.',
    errWsInside: (n: string) => `La cartella del workspace non può stare dentro il progetto «${n}».`,
    notAWorkspace: (n: number) => `La cartella scelta non è un workspace ma contiene ${n} ${plural(n, 'progetto', 'progetti')}: crea un workspace per gestirli.`,
    importing: (done: number, total: number) => `Creo i progetti… ${done} di ${total}`,
    imported: (n: number) => `${n} ${plural(n, 'progetto creato', 'progetti creati')} dalla cartella`,
  },
  en: {
    pickFolder: 'Choose the workspace folder',
    errName: 'Give the workspace a name.',
    errFolder: 'Choose a folder.',
    title: 'New workspace',
    description: 'A workspace is a folder that contains folders and projects.',
    namePlaceholder: 'E.g. Development roadmap',
    folder: 'Folder',
    folderPlaceholder: 'D:\\Roadmap or Z:\\Shared\\Roadmap',
    where: 'Where the data lives',
    local: 'Only on this PC',
    localHint: 'No password, you are the only user.',
    network: 'Shared on the network',
    networkHint: 'Folder on a server; colleagues join with a password.',
    password: 'Access password',
    repeatPassword: 'Repeat password',
    adminHint: 'You will be the administrator. Whoever opens the folder from another PC enters the password only once.',
    create: 'Create workspace',
    projectsFolder: 'Projects folder',
    scanning: 'Looking for projects in the folder…',
    found: (n: number) => `This folder contains ${n} ${plural(n, 'project', 'projects')}`,
    foundHint: 'Each project is named after its folder; the Stack is filled in from its files (repository, languages, frameworks, README).',
    importAll: 'Create the projects in the workspace',
    selectAll: 'All',
    selectNone: 'None',
    wsFolder: 'Workspace folder (Project Goal Manager data)',
    wsFolderHint: 'The workspace files should not be mixed with the project files: choose a different folder.',
    useSuggested: (p: string) => `Use ${p}`,
    pickWsFolder: 'Choose where to save the workspace',
    errWsFolder: 'Choose a folder, different from the projects folder, in which to save the workspace.',
    errWsSame: 'The workspace folder must be different from the projects folder.',
    errWsInside: (n: string) => `The workspace folder cannot be inside the project “${n}”.`,
    notAWorkspace: (n: number) => `The selected folder is not a workspace but contains ${n} ${plural(n, 'project', 'projects')}: create a workspace to manage them.`,
    importing: (done: number, total: number) => `Creating the projects… ${done} of ${total}`,
    imported: (n: number) => `${n} ${plural(n, 'project', 'projects')} created from the folder`,
  },
})

/** `presetFolder`: cartella già scelta (es. "Apri cartella" su una cartella di progetti che non è un workspace). */
const props = defineProps<{ presetFolder?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ opened: []; needsPassword: [] }>()
const ws = useWorkspaceStore()
const ui = useUiStore()


const name = ref('')
const path = ref('')
const mode = ref<WorkspaceMode>('local')
const password = ref('')
const password2 = ref('')
const error = ref('')
const busy = ref(false)

// --- progetti già presenti nella cartella scelta -----------------------------------
const scanning = ref(false)
const found = ref<DetectedProject[]>([])
const selected = ref(new Set<string>())
const importEnabled = ref(true)
const wsPath = ref('')
const suggested = ref('')
const progress = ref('')
let scanSeq = 0
async function scan(folder: string) {
  const seq = ++scanSeq
  found.value = []
  if (!folder.trim()) return
  scanning.value = true
  try {
    const list = await scanProjects(folder.trim())
    if (seq !== scanSeq) return
    found.value = list
    selected.value = new Set(list.map((p) => p.path))
    const fs = await getFs()
    const clean = folder.trim().replace(/[\\/]+$/, '')
    const parent = clean.replace(/[\\/][^\\/]+$/, '')
    const base = clean.split(/[\\/]/).pop() ?? 'Progetti'
    suggested.value = list.length && parent && parent !== clean ? await fs.join(parent, `${base} - Project Goal Manager`) : ''
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
async function pickWs() {
  const p = await (await getFs()).pickFolder(m.pickWsFolder)
  if (p) wsPath.value = p
}

watch(open, (o) => {
  if (o) {
    name.value = props.presetFolder ? (props.presetFolder.split(/[\\/]/).filter(Boolean).pop() ?? '') : ''
    path.value = props.presetFolder ?? ''
    wsPath.value = ''
    found.value = []
    importEnabled.value = true
    progress.value = ''
    mode.value = 'local'
    password.value = ''
    password2.value = ''
    error.value = ''
  }
})

async function pick() {
  const fs = await getFs()
  const p = await fs.pickFolder(m.pickFolder)
  if (p) {
    path.value = p
    if (!name.value) name.value = p.split(/[\\/]/).filter(Boolean).pop() ?? ''
  }
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) return (error.value = m.errName)
  if (!path.value) return (error.value = m.errFolder)
  // Con dei progetti nella cartella, il workspace va salvato altrove
  if (hasProjects.value) {
    if (!wsPath.value.trim()) return (error.value = m.errWsFolder)
    if (samePath(wsPath.value, path.value)) return (error.value = m.errWsSame)
    const inside = found.value.find((p) => isInside(wsPath.value, p.path))
    if (inside) return (error.value = m.errWsInside(inside.name))
  }
  if (mode.value === 'network') {
    if (password.value.length < 6) return (error.value = common.password.tooShort)
    if (password.value !== password2.value) return (error.value = common.password.mismatch)
  }
  busy.value = true
  const target = hasProjects.value ? wsPath.value.trim() : path.value
  const r = await ws.create({ path: target, name: name.value, mode: mode.value, password: password.value })
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
      <div>
        <label class="label" for="ws-name">{{ common.name }}</label>
        <input id="ws-name" v-model="name" class="field" :placeholder="m.namePlaceholder" data-autofocus />
      </div>
      <p v-if="presetFolder && hasProjects" class="rounded-md bg-accent-soft px-3 py-2 text-[12.5px] text-accent-ink">{{ m.notAWorkspace(found.length) }}</p>
      <div>
        <label class="label" for="ws-path">{{ hasProjects ? m.projectsFolder : m.folder }}</label>
        <div class="flex gap-2">
          <input id="ws-path" v-model="path" class="field font-mono text-[12.5px]" :placeholder="m.folderPlaceholder" />
          <BaseButton @click="pick"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p v-if="scanning" class="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-3"><Loader2 :size="12" class="animate-spin" /> {{ m.scanning }}</p>
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
      <div v-if="hasProjects">
        <label class="label" for="ws-data">{{ m.wsFolder }}</label>
        <div class="flex gap-2">
          <input id="ws-data" v-model="wsPath" class="field font-mono text-[12.5px]" />
          <BaseButton @click="pickWs"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.wsFolderHint }}</p>
        <button v-if="suggested && !samePath(suggested, wsPath)" type="button" class="mt-1 truncate text-left font-mono text-[12px] text-accent-ink hover:underline" @click="wsPath = suggested">
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
        <p class="col-span-2 text-[12.5px] text-ink-2">
          {{ m.adminHint }}
        </p>
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
