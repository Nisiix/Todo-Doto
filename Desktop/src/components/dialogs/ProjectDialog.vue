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
    diskPath: 'Cartella del progetto sul disco',
    diskHint: 'Dove si trovano i file del progetto. Se la cartella non esiste ancora, la crei dalla sezione Stack con «Crea cartella del progetto».',
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
    diskPath: 'Project folder on disk',
    diskHint: 'Where the project files are. If the folder does not exist yet, create it from the Stack section with “Create project folder”.',
    pickDisk: 'Choose the project folder',
    create: 'Create project',
    stackFrom: 'Stack and initial setup',
    emptyStack: 'Empty',
    copyFrom: (n: string) => `Copy from “${n}”`,
    stackHint: 'Copies technologies, prerequisites, steps, variables and initial files; the source project name becomes the new one.',
  },
})

/**
 * Creazione di un progetto. (Il nome si cambia nell'intestazione del progetto
 * con la matita, chi lo vede con «Gestione utenti».)
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

// Cartella del progetto sul disco (Stack › Cartella del progetto): si propone
// <cartella dei progetti del workspace>/<nome> finché non la si cambia a mano.
const diskPath = ref('')
let diskTouched = false
watch(name, async (n) => {
  const root = ws.meta?.projectsPath
  if (!open.value || diskTouched || !root) return
  diskPath.value = n.trim() ? await (await getFs()).join(root, n.trim()) : ''
})
function onDiskInput() {
  diskTouched = true
}
async function pickDisk() {
  const p = await (await getFs()).pickFolder(m.pickDisk)
  if (p) {
    diskPath.value = p
    diskTouched = true
  }
}

watch(open, (o) => {
  if (!o) return
  diskPath.value = ''
  diskTouched = false
  name.value = ''
  members.value = []
  access.value = 'all'
  error.value = ''
  stackSource.value = props.stackFrom ?? null
})

async function submit() {
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
      </div>
      <div>
        <label class="label" for="p-disk">{{ m.diskPath }}</label>
        <div class="flex gap-2">
          <input id="p-disk" v-model="diskPath" class="field font-mono text-[12.5px]" @input="onDiskInput" />
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
