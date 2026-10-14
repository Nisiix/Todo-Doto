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
import { DATE, defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    cannotOpen: (name: string, err: string) => `Non riesco ad aprire «${name}»: ${err}`,
    removeTitle: (name: string) => `Rimuovere «${name}» dagli allegati?`,
    removeMessage: 'Il file o la pagina non vengono toccati.',
    deleteFolderTitle: (name: string) => `Eliminare la cartella «${name}»?`,
    deleteFolderMessage: 'Gli allegati che contiene restano, senza cartella.',
    deleteFolder: 'Elimina cartella',
    preview: 'Anteprima',
    previewInApp: 'Anteprima nell’app',
    openSystem: 'Apri con l’app di sistema',
    openDrive: 'Apri su Google Drive',
    openBrowser: 'Apri nel browser',
    moveTo: (name: string) => `Sposta in «${name}»`,
    removeFromFolder: 'Togli dalla cartella',
    addHere: 'Aggiungi allegato qui',
    attachment: 'Allegato',
    folder: 'Cartella',
    folderActions: 'Azioni cartella',
    noFolder: 'Senza cartella',
    emptyFolder: 'Cartella vuota.',
    empty: 'Nessun allegato. Collega documenti sul server, pagine online o file di Google Drive: si vedono qui nell’app, con un click.',
    renameFolder: 'Rinomina cartella',
    newFolder: 'Nuova cartella allegati',
    folderPlaceholder: 'Es. Specifiche, Mockup, Contratti',
  },
  en: {
    cannotOpen: (name: string, err: string) => `Cannot open “${name}”: ${err}`,
    removeTitle: (name: string) => `Remove “${name}” from attachments?`,
    removeMessage: 'The file or page itself is not touched.',
    deleteFolderTitle: (name: string) => `Delete the folder “${name}”?`,
    deleteFolderMessage: 'The attachments it contains are kept, without a folder.',
    deleteFolder: 'Delete folder',
    preview: 'Preview',
    previewInApp: 'Preview in the app',
    openSystem: 'Open with the system app',
    openDrive: 'Open on Google Drive',
    openBrowser: 'Open in the browser',
    moveTo: (name: string) => `Move to “${name}”`,
    removeFromFolder: 'Remove from folder',
    addHere: 'Add attachment here',
    attachment: 'Attachment',
    folder: 'Folder',
    folderActions: 'Folder actions',
    noFolder: 'No folder',
    emptyFolder: 'Empty folder.',
    empty: 'No attachments. Link documents on the server, web pages or Google Drive files: you view them right here in the app, with one click.',
    renameFolder: 'Rename folder',
    newFolder: 'New attachments folder',
    folderPlaceholder: 'E.g. Specs, Mockups, Contracts',
  },
})

const props = defineProps<{ project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const drive = useDriveStore()
const ui = useUiStore()
const confirm = useConfirm()
onMounted(() => void drive.init())

const groups = computed(() => {
  const byFolder = (fid: string | null) => props.project.attachments.filter((a) => a.folderId === fid)
  return [
    ...props.project.attachmentFolders.map((f) => ({ folder: f as AttachmentFolder | null, items: byFolder(f.id) })),
    { folder: null, items: byFolder(null) },
  ]
})

const ICON = { link: Globe, file: FileText, drive: Cloud }
const openLabel = (a: Attachment) => (a.kind === 'file' ? m.openSystem : a.kind === 'drive' ? m.openDrive : m.openBrowser)
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
    ui.toast(m.cannotOpen(a.name, e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
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
  if (await confirm({ title: m.removeTitle(a.name), message: m.removeMessage, confirmLabel: common.actions.remove, danger: true }))
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
  if (await confirm({ title: m.deleteFolderTitle(f.name), message: m.deleteFolderMessage, confirmLabel: m.deleteFolder, danger: true }))
    await ws.removeAttachmentFolder(props.project.id, f.id)
}

const attMenu = (a: Attachment) => [
  { label: m.preview, icon: Eye, onSelect: () => preview(a) },
  { label: openLabel(a), icon: ExternalLink, onSelect: () => openOriginal(a) },
  ...(props.readOnly
    ? []
    : [
        { label: common.actions.edit, icon: Pencil, onSelect: () => edit(a) },
        { sep: true, label: '' },
        ...props.project.attachmentFolders
          .filter((f) => f.id !== a.folderId)
          .map((f) => ({ label: m.moveTo(f.name), onSelect: () => ws.updateAttachment(props.project.id, a.id, { folderId: f.id }) })),
        ...(a.folderId ? [{ label: m.removeFromFolder, onSelect: () => ws.updateAttachment(props.project.id, a.id, { folderId: null }) }] : []),
        { sep: true, label: '' },
        { label: common.actions.remove, icon: Trash2, danger: true, onSelect: () => remove(a) },
      ]),
]
const folderMenu = (f: AttachmentFolder) => [
  { label: m.addHere, icon: Plus, onSelect: () => add(f.id) },
  { label: common.actions.rename, icon: Pencil, onSelect: () => renameFolder(f) },
  { label: m.deleteFolder, icon: Trash2, danger: true, onSelect: () => removeFolder(f) },
]
</script>

<template>
  <div class="space-y-6">
    <div v-if="!readOnly" class="flex gap-2">
      <BaseButton variant="primary" size="sm" @click="add(null)"><Plus :size="14" /> {{ m.attachment }}</BaseButton>
      <BaseButton size="sm" @click="newFolder"><FolderPlus :size="14" /> {{ m.folder }}</BaseButton>
    </div>

    <section v-for="g in groups" :key="g.folder?.id ?? 'root'">
      <div v-if="g.folder" class="group mb-1 flex items-center gap-2">
        <h3 class="text-[13px] font-semibold text-ink-2">{{ g.folder.name }}</h3>
        <span class="text-[12px] tabular-nums text-ink-3">{{ g.items.length }}</span>
        <BaseMenu v-if="!readOnly" :items="folderMenu(g.folder)">
          <MenuTriggerButton :label="m.folderActions" :size="14" class="!p-0.5" />
        </BaseMenu>
      </div>
      <h3 v-else-if="project.attachmentFolders.length && g.items.length" class="mb-1 text-[13px] font-semibold text-ink-3">{{ m.noFolder }}</h3>

      <ul v-if="g.items.length" class="divide-y divide-line">
        <li v-for="a in g.items" :key="a.id" class="group flex h-10 items-center gap-3 pr-1 hover:bg-surface-2">
          <component :is="ICON[a.kind]" :size="16" class="ml-1 shrink-0 text-accent" />
          <button class="min-w-0 flex-1 text-left" :title="m.previewInApp" @click="preview(a)">
            <span class="block truncate text-[13.5px] font-medium hover:text-accent-ink">{{ a.name }}</span>
            <span class="block truncate font-mono text-[11px] text-ink-3">{{ subtitle(a) }}</span>
          </button>
          <span class="shrink-0 text-[11.5px] text-ink-3">{{ ws.userName(a.addedBy) }} · {{ dayjs(a.addedAt).format(DATE.dayMonth) }}</span>
          <button class="shrink-0 rounded-md p-1 text-ink-3 opacity-0 hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100" :title="openLabel(a)" @click="openOriginal(a)">
            <ExternalLink :size="14" />
          </button>
          <BaseMenu :items="attMenu(a)">
            <MenuTriggerButton />
          </BaseMenu>
        </li>
      </ul>
      <p v-else-if="g.folder" class="text-[12.5px] text-ink-3">{{ m.emptyFolder }}</p>
    </section>

    <p v-if="!project.attachments.length" class="max-w-md text-[13.5px] leading-relaxed text-ink-2">
      {{ m.empty }}
    </p>

    <AttachmentDialog v-model:open="showAtt" :project="project" :attachment="editing" :default-folder-id="defaultFolder" />
    <AttachmentViewer v-model:open="viewerOpen" :item="viewerItem" />
    <NameDialog
      v-model:open="showFolder"
      :title="folderEditing ? m.renameFolder : m.newFolder"
      :initial="folderEditing?.name ?? ''"
      :placeholder="m.folderPlaceholder"
      :confirm-label="folderEditing ? common.actions.rename : common.actions.create"
      @submit="submitFolder"
    />
  </div>
</template>
