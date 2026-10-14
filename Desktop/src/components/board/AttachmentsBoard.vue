<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Cloud, ExternalLink, Eye, FileText, FolderPlus, Globe, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import AttachmentDialog from '@/components/dialogs/AttachmentDialog.vue'
import AttachmentViewer, { type ViewerTarget } from '@/components/dialogs/AttachmentViewer.vue'
import NameDialog from '@/components/dialogs/NameDialog.vue'
import { getFs } from '@/services/fs'
import { useWorkspaceStore } from '@/stores/workspace'
import { useDriveStore } from '@/stores/drive'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import type { Attachment, AttachmentFolder, Project } from '@/types'

const props = defineProps<{ project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const drive = useDriveStore()
const ui = useUiStore()
const confirm = useConfirm()
onMounted(() => void drive.init())

const groups = computed(() => {
  const q = ui.search.trim().toLowerCase()
  const match = (a: Attachment) => !q || a.name.toLowerCase().includes(q) || a.target.toLowerCase().includes(q)
  const byFolder = (fid: string | null) => props.project.attachments.filter((a) => a.folderId === fid && match(a))
  return [
    ...props.project.attachmentFolders.map((f) => ({ folder: f as AttachmentFolder | null, items: byFolder(f.id) })),
    { folder: null, items: byFolder(null) },
  ]
})

const ICON = { link: Globe, file: FileText, drive: Cloud }
const subtitle = (a: Attachment) => (a.kind === 'drive' ? drive.pathOf(a.target) || 'Google Drive' : a.target)

// --- anteprima e apertura ----------------------------------------------------
const viewerOpen = ref(false)
const viewerItem = ref<ViewerTarget | null>(null)
function preview(a: Attachment) {
  const node = a.kind === 'drive' ? drive.nodesById[a.target] : undefined
  viewerItem.value = { kind: a.kind, name: a.name, target: a.target, mime: node?.mimeType ?? null, webViewLink: node?.webViewLink ?? null }
  viewerOpen.value = true
}
async function openOriginal(a: Attachment) {
  try {
    const fs = await getFs()
    if (a.kind === 'drive') {
      const link = drive.nodesById[a.target]?.webViewLink ?? `https://drive.google.com/open?id=${a.target}`
      await fs.openExternal(link, 'link')
    } else await fs.openExternal(a.target, a.kind)
  } catch (e) {
    ui.toast(`Non riesco ad aprire «${a.name}»: ${e instanceof Error ? e.message : e}`, 'error', undefined, 6000)
  }
}

// --- dialog allegato ----------------------------------------------------------
const showAtt = ref(false)
const editing = ref<Attachment | null>(null)
const defaultFolder = ref<string | null>(null)
function add(folderId: string | null) {
  editing.value = null
  defaultFolder.value = folderId
  showAtt.value = true
}
function edit(a: Attachment) {
  editing.value = a
  showAtt.value = true
}
async function remove(a: Attachment) {
  if (await confirm({ title: `Rimuovere «${a.name}» dagli allegati?`, message: 'Il file o la pagina non vengono toccati.', confirmLabel: 'Rimuovi', danger: true }))
    await ws.removeAttachment(props.project.id, a.id)
}

// --- cartelle di allegati ------------------------------------------------------
const showFolder = ref(false)
const folderEditing = ref<AttachmentFolder | null>(null)
function newFolder() {
  folderEditing.value = null
  showFolder.value = true
}
function renameFolder(f: AttachmentFolder) {
  folderEditing.value = f
  showFolder.value = true
}
function submitFolder(name: string) {
  if (folderEditing.value) ws.renameAttachmentFolder(props.project.id, folderEditing.value.id, name)
  else ws.addAttachmentFolder(props.project.id, name)
}
async function removeFolder(f: AttachmentFolder) {
  if (await confirm({ title: `Eliminare la cartella «${f.name}»?`, message: 'Gli allegati che contiene restano, senza cartella.', confirmLabel: 'Elimina cartella', danger: true }))
    await ws.removeAttachmentFolder(props.project.id, f.id)
}

const attMenu = (a: Attachment) => [
  { label: 'Anteprima', icon: Eye, onSelect: () => preview(a) },
  { label: a.kind === 'file' ? 'Apri con l’app di sistema' : a.kind === 'drive' ? 'Apri su Google Drive' : 'Apri nel browser', icon: ExternalLink, onSelect: () => openOriginal(a) },
  ...(props.readOnly
    ? []
    : [
        { label: 'Modifica', icon: Pencil, onSelect: () => edit(a) },
        { sep: true, label: '' },
        ...props.project.attachmentFolders
          .filter((f) => f.id !== a.folderId)
          .map((f) => ({ label: `Sposta in «${f.name}»`, onSelect: () => ws.updateAttachment(props.project.id, a.id, { folderId: f.id }) })),
        ...(a.folderId ? [{ label: 'Togli dalla cartella', onSelect: () => ws.updateAttachment(props.project.id, a.id, { folderId: null }) }] : []),
        { sep: true, label: '' },
        { label: 'Rimuovi', icon: Trash2, danger: true, onSelect: () => remove(a) },
      ]),
]
const folderMenu = (f: AttachmentFolder) => [
  { label: 'Aggiungi allegato qui', icon: Plus, onSelect: () => add(f.id) },
  { label: 'Rinomina', icon: Pencil, onSelect: () => renameFolder(f) },
  { label: 'Elimina cartella', icon: Trash2, danger: true, onSelect: () => removeFolder(f) },
]
</script>

<template>
  <div class="space-y-6">
    <div v-if="!readOnly" class="flex gap-2">
      <BaseButton variant="primary" size="sm" @click="add(null)"><Plus :size="14" /> Allegato</BaseButton>
      <BaseButton size="sm" @click="newFolder"><FolderPlus :size="14" /> Cartella</BaseButton>
    </div>

    <section v-for="g in groups" :key="g.folder?.id ?? 'root'">
      <div v-if="g.folder" class="group mb-1 flex items-center gap-2">
        <h3 class="text-[13px] font-semibold text-ink-2">{{ g.folder.name }}</h3>
        <span class="text-[12px] tabular-nums text-ink-3">{{ g.items.length }}</span>
        <BaseMenu v-if="!readOnly" :items="folderMenu(g.folder)">
          <MenuTriggerButton label="Azioni cartella" :size="14" class="!p-0.5" />
        </BaseMenu>
      </div>
      <h3 v-else-if="project.attachmentFolders.length && g.items.length" class="mb-1 text-[13px] font-semibold text-ink-3">Senza cartella</h3>

      <ul v-if="g.items.length" class="divide-y divide-line">
        <li v-for="a in g.items" :key="a.id" class="group flex h-10 items-center gap-3 pr-1 hover:bg-surface-2">
          <component :is="ICON[a.kind]" :size="16" class="ml-1 shrink-0 text-accent" />
          <button class="min-w-0 flex-1 text-left" :title="'Anteprima nell’app'" @click="preview(a)">
            <span class="block truncate text-[13.5px] font-medium hover:text-accent-ink">{{ a.name }}</span>
            <span class="block truncate font-mono text-[11px] text-ink-3">{{ subtitle(a) }}</span>
          </button>
          <span class="shrink-0 text-[11.5px] text-ink-3">{{ ws.userName(a.addedBy) }} · {{ dayjs(a.addedAt).format('D MMM') }}</span>
          <button class="shrink-0 rounded-md p-1 text-ink-3 opacity-0 hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100" :title="a.kind === 'file' ? 'Apri con l’app di sistema' : a.kind === 'drive' ? 'Apri su Google Drive' : 'Apri nel browser'" @click="openOriginal(a)">
            <ExternalLink :size="14" />
          </button>
          <BaseMenu :items="attMenu(a)">
            <MenuTriggerButton />
          </BaseMenu>
        </li>
      </ul>
      <p v-else-if="g.folder" class="text-[12.5px] text-ink-3">Cartella vuota.</p>
    </section>

    <p v-if="!project.attachments.length" class="max-w-md text-[13.5px] leading-relaxed text-ink-2">
      Nessun allegato. Collega documenti sul server, pagine online o file di Google Drive: si vedono qui nell’app, con un click.
    </p>

    <AttachmentDialog v-model:open="showAtt" :project="project" :attachment="editing" :default-folder-id="defaultFolder" />
    <AttachmentViewer v-model:open="viewerOpen" :item="viewerItem" />
    <NameDialog
      v-model:open="showFolder"
      :title="folderEditing ? 'Rinomina cartella' : 'Nuova cartella allegati'"
      :initial="folderEditing?.name ?? ''"
      placeholder="Es. Specifiche, Mockup, Contratti"
      :confirm-label="folderEditing ? 'Rinomina' : 'Crea'"
      @submit="submitFolder"
    />
  </div>
</template>
