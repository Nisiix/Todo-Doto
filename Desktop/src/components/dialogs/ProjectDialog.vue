<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FolderOpen, Shield } from 'lucide-vue-next'
import { getFs } from '@/services/fs'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Project } from '@/types'
import { copyStack, hasStack } from '@/services/scaffold'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    errName: 'Il progetto ha bisogno di un nome.',
    errMembers: 'Scegli almeno una persona, oppure apri il progetto a tutti.',
    settings: 'Impostazioni progetto',
    newProject: 'Nuovo progetto',
    namePlaceholder: 'Es. Progetto di test',
    description: 'Descrizione',
    optional: 'Facoltativa',
    folder: 'Cartella nella barra laterale',
    folderHint: 'Serve solo a raggruppare i progetti nella barra laterale (es. «Clienti»): non è una cartella sul disco.',
    noFolder: 'Nessuna (alla radice)',
    diskPath: 'Cartella del progetto sul disco',
    diskHint: 'Dove si trovano i file del progetto. Se la cartella non esiste ancora, la crei dalla sezione Stack con «Crea cartella del progetto».',
    pickDisk: 'Scegli la cartella del progetto',
    whoCanSee: 'Chi può vedere e modificare il progetto',
    all: 'Tutti i membri del workspace',
    restricted: 'Solo alcune persone',
    adminsSeeAll: 'Gli amministratori vedono sempre tutti i progetti',
    userOn: (u: string, h: string) => `${u} su ${h}`,
    noOthers: 'Nessun altro membro ancora: gli utenti compaiono qui dopo il primo accesso al workspace.',
    selected: (n: number) => `${n} ${n === 1 ? 'persona scelta' : 'persone scelte'}. Chi non è nella lista non vede il progetto, nemmeno nella barra laterale.`,
    visibleAll: 'Visibile a chiunque apra questo workspace con la password.',
    create: 'Crea progetto',
    stackFrom: 'Stack e configurazione iniziale',
    emptyStack: 'Vuoto',
    copyFrom: (n: string) => `Copia da «${n}»`,
    stackHint: 'Copia tecnologie, prerequisiti, passi, variabili e file iniziali; il nome del progetto di origine diventa quello nuovo.',
  },
  en: {
    errName: 'The project needs a name.',
    errMembers: 'Choose at least one person, or open the project to everyone.',
    settings: 'Project settings',
    newProject: 'New project',
    namePlaceholder: 'E.g. Test project',
    description: 'Description',
    optional: 'Optional',
    folder: 'Sidebar folder',
    folderHint: 'Only used to group projects in the sidebar (e.g. “Customers”): it is not a folder on disk.',
    noFolder: 'None (at the root)',
    diskPath: 'Project folder on disk',
    diskHint: 'Where the project files are. If the folder does not exist yet, create it from the Stack section with “Create project folder”.',
    pickDisk: 'Choose the project folder',
    whoCanSee: 'Who can see and edit the project',
    all: 'All workspace members',
    restricted: 'Only some people',
    adminsSeeAll: 'Administrators always see every project',
    userOn: (u: string, h: string) => `${u} on ${h}`,
    noOthers: 'No other members yet: users appear here after their first access to the workspace.',
    selected: (n: number) => `${n} ${n === 1 ? 'person selected' : 'people selected'}. Anyone not on the list cannot see the project, not even in the sidebar.`,
    visibleAll: 'Visible to anyone who opens this workspace with the password.',
    create: 'Create project',
    stackFrom: 'Stack and initial setup',
    emptyStack: 'Empty',
    copyFrom: (n: string) => `Copy from “${n}”`,
    stackHint: 'Copies technologies, prerequisites, steps, variables and initial files; the source project name becomes the new one.',
  },
})

/** `stackFrom`: id del progetto da cui copiare lo stack (preselezionato alla creazione). */
const props = defineProps<{ project?: Project | null; defaultFolderId?: string | null; stackFrom?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const router = useRouter()

const name = ref('')
const description = ref('')
const folderId = ref<string | null>(null)
const access = ref<'all' | 'restricted'>('all')
const members = ref<string[]>([])
const error = ref('')
const stackSource = ref<string | null>(null)
/** Progetti con uno stack da usare come modello (solo per gli admin, alla creazione). */
const templates = computed(() => (ws.isAdmin ? ws.visibleProjects.filter((p) => hasStack(p.stack)) : []))

const isEdit = computed(() => !!props.project)
/** Gli admin vedono sempre tutto: nella lista sono mostrati ma non selezionabili. */
const admins = computed(() => ws.users.filter((u) => u.role === 'admin'))
const others = computed(() => ws.users.filter((u) => u.role !== 'admin'))
const selectedCount = computed(() => members.value.filter((id) => others.value.some((u) => u.id === id)).length)

// Cartella del progetto sul disco (Stack › Cartella del progetto). Per un
// progetto nuovo si propone <cartella dei progetti del workspace>/<nome>.
const diskPath = ref('')
let diskTouched = false
watch(name, async (n) => {
  const root = ws.meta?.projectsPath
  if (!open.value || isEdit.value || diskTouched || !root) return
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
  const p = props.project
  diskPath.value = p?.stack.sourcePath ?? ''
  diskTouched = !!p
  name.value = p?.name ?? ''
  description.value = p?.description ?? ''
  folderId.value = p?.folderId ?? props.defaultFolderId ?? null
  members.value = p?.members ? [...p.members] : []
  access.value = members.value.length > 0 ? 'restricted' : 'all'
  error.value = ''
  stackSource.value = p ? null : (props.stackFrom ?? null)
})

/** Cartelle in ordine ad albero, con indentazione. */
const folderOptions = computed(() => {
  const out: { id: string; label: string }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const f of ws.foldersByParent[parentId ?? 'root'] ?? []) {
      out.push({ id: f.id, label: `${'  '.repeat(depth)}${depth ? '└ ' : ''}${f.name}` })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

function toggleMember(id: string) {
  members.value = members.value.includes(id) ? members.value.filter((m) => m !== id) : [...members.value, id]
}

async function submit() {
  if (!name.value.trim()) return (error.value = m.errName)
  // Con accesso riservato, gli admin sono inclusi comunque: così il file resta
  // coerente anche se più avanti un admin viene retrocesso a membro.
  const restrictedMembers = [...new Set([...members.value.filter((id) => others.value.some((u) => u.id === id)), ...admins.value.map((a) => a.id)])]
  if (access.value === 'restricted' && selectedCount.value === 0 && others.value.length > 0)
    return (error.value = m.errMembers)
  const data = {
    name: name.value,
    description: description.value.trim(),
    folderId: folderId.value,
    members: access.value === 'restricted' && ws.isNetwork ? restrictedMembers : [],
  }
  if (props.project) {
    await ws.updateProject(props.project.id, data)
    if (diskPath.value.trim() !== props.project.stack.sourcePath) await ws.setProjectSourcePath(props.project.id, diskPath.value)
  } else {
    const p = await ws.createProject(data)
    const source = stackSource.value ? ws.projects[stackSource.value] : null
    if (p && source) await ws.updateStack(p.id, copyStack(source.stack, source.name, p.name))
    if (p && diskPath.value.trim()) await ws.setProjectSourcePath(p.id, diskPath.value)
    if (p) router.push({ name: 'project', params: { id: p.id, section: source ? 'stack' : '' } })
  }
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="isEdit ? m.settings : m.newProject">
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="p-name">{{ common.name }}</label>
        <input id="p-name" v-model="name" class="field" :placeholder="m.namePlaceholder" data-autofocus />
      </div>
      <div>
        <label class="label" for="p-desc">{{ m.description }}</label>
        <textarea id="p-desc" v-model="description" class="field min-h-16 resize-y" :placeholder="m.optional" />
      </div>
      <div>
        <label class="label" for="p-disk">{{ m.diskPath }}</label>
        <div class="flex gap-2">
          <input id="p-disk" v-model="diskPath" class="field font-mono text-[12.5px]" @input="onDiskInput" />
          <BaseButton :aria-label="m.pickDisk" @click="pickDisk"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.diskHint }}</p>
      </div>
      <div>
        <label class="label" for="p-folder">{{ m.folder }}</label>
        <select id="p-folder" v-model="folderId" class="field">
          <option :value="null">{{ m.noFolder }}</option>
          <option v-for="f in folderOptions" :key="f.id" :value="f.id">{{ f.label }}</option>
        </select>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.folderHint }}</p>
      </div>
      <div v-if="!isEdit && templates.length">
        <label class="label" for="p-stack">{{ m.stackFrom }}</label>
        <select id="p-stack" v-model="stackSource" class="field">
          <option :value="null">{{ m.emptyStack }}</option>
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ m.copyFrom(t.name) }}</option>
        </select>
        <p v-if="stackSource" class="mt-1 text-[12px] text-ink-3">{{ m.stackHint }}</p>
      </div>

      <div v-if="ws.isNetwork && ws.isAdmin">
        <span class="label">{{ m.whoCanSee }}</span>
        <SegmentedControl
          v-model="access"
          :options="[
            { value: 'all', label: m.all },
            { value: 'restricted', label: m.restricted },
          ]"
        />
        <div v-if="access === 'restricted'" class="mt-2 rounded-md border border-line">
          <ul class="max-h-44 divide-y divide-line overflow-y-auto">
            <li v-for="u in admins" :key="u.id" class="flex items-center gap-2 px-2 py-1.5 text-[13.5px] text-ink-2">
              <input type="checkbox" class="accent-accent" checked disabled />
              <UserAvatar :name="u.displayName" size="xs" />
              <span class="flex-1">{{ u.displayName }}<span v-if="u.id === ws.currentUser?.id"> ({{ common.you }})</span></span>
              <span class="flex items-center gap-1 text-[11.5px] text-ink-3" :title="m.adminsSeeAll"><Shield :size="11" /> admin</span>
            </li>
            <li v-for="u in others" :key="u.id">
              <label class="flex items-center gap-2 px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
                <input type="checkbox" class="accent-accent" :checked="members.includes(u.id)" @change="toggleMember(u.id)" />
                <UserAvatar :name="u.displayName" size="xs" />
                <span class="flex-1">{{ u.displayName }}</span>
                <span class="text-[11.5px] text-ink-3">{{ m.userOn(u.username, u.hostname) }}</span>
              </label>
            </li>
          </ul>
          <p class="border-t border-line px-2 py-1.5 text-[12px] text-ink-3">
            <template v-if="others.length === 0">{{ m.noOthers }}</template>
            <template v-else>{{ m.selected(selectedCount) }}</template>
          </p>
        </div>
        <p v-else class="mt-1.5 text-[12px] text-ink-3">{{ m.visibleAll }}</p>
      </div>

      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" @click="submit">{{ isEdit ? common.actions.save : m.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
