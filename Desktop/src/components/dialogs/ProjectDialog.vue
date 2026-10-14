<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FolderOpen } from 'lucide-vue-next'
import { getFs } from '@/services/fs'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ProjectAccessFields, { resolveMembers, type ProjectAccess } from '@/components/project/ProjectAccessFields.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { copyStack, hasStack } from '@/services/scaffold'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    errName: 'Il progetto ha bisogno di un nome.',
    errMembers: 'Scegli almeno una persona, oppure apri il progetto a tutti.',
    newProject: 'Nuovo progetto',
    namePlaceholder: 'Es. Progetto di test',
    nameHint: (folder: string) => `Il nome del progetto è il nome della sua cartella sul disco${folder ? ` (${folder})` : ''} e dopo la creazione non si cambia più.`,
    nameHintNoRoot: 'Il nome del progetto è il nome della sua cartella sul disco e dopo la creazione non si cambia più.',
    diskPath: 'Cartella del progetto sul disco',
    diskHint: 'Dove si trovano (o verranno creati) i file del progetto. Scegliendo una cartella esistente il progetto ne prende il nome; se non esiste ancora, la crei dalla sezione Stack con «Crea cartella del progetto».',
    pickDisk: 'Scegli la cartella del progetto',
    create: 'Crea progetto',
    stackFrom: 'Stack e configurazione iniziale',
    emptyStack: 'Vuoto',
    copyFrom: (n: string) => `Copia da «${n}»`,
    stackHint: 'Copia tecnologie, prerequisiti, passi, variabili e file iniziali; il nome del progetto di origine diventa quello nuovo.',
  },
  en: {
    errName: 'The project needs a name.',
    errMembers: 'Choose at least one person, or open the project to everyone.',
    newProject: 'New project',
    namePlaceholder: 'E.g. Test project',
    nameHint: (folder: string) => `The project name is the name of its folder on disk${folder ? ` (${folder})` : ''} and cannot be changed after creation.`,
    nameHintNoRoot: 'The project name is the name of its folder on disk and cannot be changed after creation.',
    diskPath: 'Project folder on disk',
    diskHint: 'Where the project files are (or will be created). Choosing an existing folder gives the project its name; if it does not exist yet, create it from the Stack section with “Create project folder”.',
    pickDisk: 'Choose the project folder',
    create: 'Create project',
    stackFrom: 'Stack and initial setup',
    emptyStack: 'Empty',
    copyFrom: (n: string) => `Copy from “${n}”`,
    stackHint: 'Copies technologies, prerequisites, steps, variables and initial files; the source project name becomes the new one.',
  },
})

/**
 * Creazione di un progetto. Il nome è quello della cartella del progetto sul
 * disco (e non si cambia più): scrivendo il nome si propone
 * <cartella dei progetti>/<nome>, scegliendo una cartella se ne prende il nome.
 * Chi vede il progetto si cambia poi da Membri › Gestione permessi.
 * `stackFrom`: id del progetto da cui copiare lo stack (preselezionato).
 */
const props = defineProps<{ defaultFolderId?: string | null; stackFrom?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const router = useRouter()

const name = ref('')
const access = ref<ProjectAccess>('all')
const members = ref<string[]>([])
const error = ref('')
const stackSource = ref<string | null>(null)
/** Progetti con uno stack da usare come modello (solo per gli admin). */
const templates = computed(() => (ws.isAdmin ? ws.visibleProjects.filter((p) => hasStack(p.stack)) : []))

// Cartella del progetto sul disco (Stack › Cartella del progetto) e nome vanno
// insieme: il nome è l'ultima parte del percorso della cartella.
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

watch(open, (o) => {
  if (!o) return
  diskPath.value = ''
  name.value = ''
  members.value = []
  access.value = 'all'
  error.value = ''
  stackSource.value = props.stackFrom ?? null
})

async function submit() {
  // Il nome è sempre quello della cartella, quando c'è
  const folder = folderName(diskPath.value.trim())
  if (folder) name.value = folder
  if (!name.value.trim()) return (error.value = m.errName)
  const memberIds = ws.isNetwork ? resolveMembers(ws.users, access.value, members.value) : []
  if (!memberIds) return (error.value = m.errMembers)
  // Il progetto nasce nella cartella della barra laterale da cui lo si crea (o alla radice)
  const p = await ws.createProject({ name: name.value, description: '', folderId: props.defaultFolderId ?? null, members: memberIds })
  const source = stackSource.value ? ws.projects[stackSource.value] : null
  if (p && source) await ws.updateStack(p.id, copyStack(source.stack, source.name, p.name))
  if (p && diskPath.value.trim()) await ws.setProjectSourcePath(p.id, diskPath.value)
  if (p) router.push({ name: 'project', params: { id: p.id, section: source ? 'stack' : '' } })
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.newProject">
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="p-name">{{ common.name }}</label>
        <input id="p-name" v-model="name" class="field" :placeholder="m.namePlaceholder" data-autofocus />
        <p class="mt-1 text-[12px] text-ink-3" data-name-hint>{{ ws.projectsRoot ? m.nameHint(diskPath.trim()) : m.nameHintNoRoot }}</p>
      </div>
      <div>
        <label class="label" for="p-disk">{{ m.diskPath }}</label>
        <div class="flex gap-2">
          <input id="p-disk" v-model="diskPath" class="field font-mono text-[12.5px]" @input="syncName" />
          <BaseButton :aria-label="m.pickDisk" @click="pickDisk"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.diskHint }}</p>
      </div>
      <div v-if="templates.length">
        <label class="label" for="p-stack">{{ m.stackFrom }}</label>
        <select id="p-stack" v-model="stackSource" class="field">
          <option :value="null">{{ m.emptyStack }}</option>
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ m.copyFrom(t.name) }}</option>
        </select>
        <p v-if="stackSource" class="mt-1 text-[12px] text-ink-3">{{ m.stackHint }}</p>
      </div>

      <ProjectAccessFields v-if="ws.isNetwork && ws.isAdmin" v-model:access="access" v-model:members="members" />

      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" @click="submit">{{ m.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
