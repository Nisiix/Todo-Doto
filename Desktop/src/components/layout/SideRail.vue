<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { FolderPlus, Plus, RotateCcw, Trash2, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import FolderNode from './FolderNode.vue'
import ProjectLink from './ProjectLink.vue'
import ProjectDialog from '@/components/dialogs/ProjectDialog.vue'
import NameDialog from '@/components/dialogs/NameDialog.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'
import type { Folder, Project } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    deleteFolderTitle: (n: string) => `Eliminare la cartella «${n}»?`,
    deleteFolderMessage: (inside: number) =>
      'Verranno eliminate anche tutte le sottocartelle. ' +
      (inside ? `${inside === 1 ? 'Il progetto contenuto finisce' : `I ${inside} progetti contenuti finiscono`} nel Cestino, da dove puoi ripristinarli.` : 'Non contiene progetti.'),
    deleteFolder: 'Elimina cartella',
    deleteProjectMessage: (items: number, atts: number) => `${items} elementi e ${atts} allegati verranno eliminati per tutti. Non si può annullare.`,
    emptyTrashTitle: 'Svuotare il cestino dei progetti?',
    emptyTrashMessage: (n: number) =>
      `${n} ${n === 1 ? 'progetto verrà eliminato' : 'progetti verranno eliminati'} definitivamente, con tutti gli elementi e gli allegati. Non si può annullare.`,
    emptyTrash: 'Svuota cestino',
    emptyTrashHint: 'Svuota il cestino: elimina definitivamente tutti i progetti cestinati',
    restore: 'Ripristina',
    project: 'Progetto',
    newFolder: 'Nuova cartella',
    renameFolder: 'Rinomina cartella',
    createFolder: 'Crea cartella',
    folderName: 'Nome cartella',
    favorites: 'Preferiti',
    favoritesEmpty: 'Segna un progetto con la stella per trovarlo qui.',
    recent: 'Recenti',
    projects: 'Progetti',
    projectsEmpty: 'Nessun progetto. Creane uno con il pulsante qui sopra.',
    trash: 'Cestino',
    trashedActions: 'Azioni progetto cestinato',
  },
  en: {
    deleteFolderTitle: (n: string) => `Delete the folder “${n}”?`,
    deleteFolderMessage: (inside: number) =>
      'All its subfolders will be deleted too. ' +
      (inside ? `${inside === 1 ? 'The project inside goes' : `The ${inside} projects inside go`} to the Trash, where you can restore them.` : 'It contains no projects.'),
    deleteFolder: 'Delete folder',
    deleteProjectMessage: (items: number, atts: number) => `${items} items and ${atts} attachments will be deleted for everyone. This cannot be undone.`,
    emptyTrashTitle: 'Empty the projects trash?',
    emptyTrashMessage: (n: number) =>
      `${n} ${n === 1 ? 'project will be' : 'projects will be'} permanently deleted, with all their items and attachments. This cannot be undone.`,
    emptyTrash: 'Empty trash',
    emptyTrashHint: 'Empty the trash: permanently delete every trashed project',
    restore: 'Restore',
    project: 'Project',
    newFolder: 'New folder',
    renameFolder: 'Rename folder',
    createFolder: 'Create folder',
    folderName: 'Folder name',
    favorites: 'Favorites',
    favoritesEmpty: 'Star a project to find it here.',
    recent: 'Recent',
    projects: 'Projects',
    projectsEmpty: 'No projects. Create one with the button above.',
    trash: 'Trash',
    trashedActions: 'Trashed project actions',
  },
})

const ws = useWorkspaceStore()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()

/** Sotto questa soglia la sezione Recenti sparisce: i progetti stanno tutti sott'occhio. */
const RECENT_MIN_PROJECTS = 5

const projectsByFolder = computed(() => {
  const map: Record<string, Project[]> = {}
  for (const p of ws.visibleProjects) (map[p.folderId ?? 'root'] ??= []).push(p)
  return map
})
const rootFolders = computed(() => ws.foldersByParent['root'] ?? [])
const rootProjects = computed(() => projectsByFolder.value['root'] ?? [])

// --- progetto -------------------------------------------------------------
const showProject = ref(false)
const projectDefaultFolder = ref<string | null>(null)
function newProject(folderId: string | null = null) {
  projectDefaultFolder.value = folderId
  showProject.value = true
}

// --- cartelle -------------------------------------------------------------
const showFolder = ref(false)
const folderParent = ref<string | null>(null)
const folderEditing = ref<Folder | null>(null)
function newFolder(parentId: string | null) {
  folderEditing.value = null
  folderParent.value = parentId
  showFolder.value = true
}
function renameFolder(f: Folder) {
  folderEditing.value = f
  showFolder.value = true
}
function submitFolder(name: string) {
  if (folderEditing.value) ws.renameFolder(folderEditing.value.id, name)
  else ws.addFolder(name, folderParent.value)
}
async function removeFolder(f: Folder) {
  const inside = ws.projectsInFolderTree(f.id).length
  const ok = await confirm({
    title: m.deleteFolderTitle(f.name),
    message: m.deleteFolderMessage(inside),
    confirmLabel: m.deleteFolder,
    danger: true,
  })
  if (ok) await ws.deleteFolder(f.id)
}

// --- cestino progetti -----------------------------------------------------
const leaveIfOpen = (id: string) => {
  if (route.name === 'project' && route.params.id === id) router.replace({ name: 'workspace-home' })
}
async function deleteForever(p: Project) {
  const ok = await confirm({
    title: common.item.deleteForeverTitle(p.name),
    message: m.deleteProjectMessage(p.items.length, p.attachments.length),
    confirmLabel: common.item.deleteForeverConfirm,
    danger: true,
  })
  if (ok) {
    leaveIfOpen(p.id)
    await ws.deleteProject(p.id)
  }
}
async function emptyTrash() {
  const n = ws.trashedProjects.length
  const ok = await confirm({
    title: m.emptyTrashTitle,
    message: m.emptyTrashMessage(n),
    confirmLabel: m.emptyTrash,
    danger: true,
  })
  if (ok) {
    ws.trashedProjects.forEach((p) => leaveIfOpen(p.id))
    await ws.emptyProjectTrash()
  }
}
const trashMenu = (p: Project) => [
  { label: m.restore, icon: RotateCcw, onSelect: () => ws.restoreProject(p.id) },
  ...(ws.canPurge ? [{ label: common.item.deleteForever, icon: X, danger: true, onSelect: () => deleteForever(p) }] : []),
]
</script>

<template>
  <aside class="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
    <div class="flex items-center gap-1 px-3 pt-3">
      <BaseButton variant="primary" size="sm" class="flex-1" @click="newProject(null)"><Plus :size="14" /> {{ m.project }}</BaseButton>
      <BaseButton size="icon-sm" :title="m.newFolder" @click="newFolder(null)"><FolderPlus :size="14" /></BaseButton>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-4 pt-3">
      <!-- Preferiti -->
      <section class="mb-4">
        <h2 class="mb-1 px-1 text-[11.5px] font-semibold text-ink-3">{{ m.favorites }}</h2>
        <ul v-if="ws.favoriteProjects.length">
          <ProjectLink v-for="p in ws.favoriteProjects" :key="p.id" :project="p" :depth="-1" />
        </ul>
        <p v-else class="px-1 text-[12px] text-ink-3">{{ m.favoritesEmpty }}</p>
      </section>

      <!-- Recenti: utile solo quando i progetti sono tanti, altrimenti è rumore -->
      <section v-if="ws.visibleProjects.length >= RECENT_MIN_PROJECTS" class="mb-4">
        <h2 class="mb-1 px-1 text-[11.5px] font-semibold text-ink-3">{{ m.recent }}</h2>
        <ul>
          <ProjectLink v-for="p in ws.recentProjects" :key="p.id" :project="p" :depth="-1" :hint="dayjs(p.updatedAt).fromNow(true)" />
        </ul>
      </section>

      <!-- Progetti -->
      <section class="mb-4">
        <h2 class="mb-1 px-1 text-[11.5px] font-semibold text-ink-3">{{ m.projects }}</h2>
        <ul v-if="rootFolders.length || rootProjects.length">
          <FolderNode
            v-for="f in rootFolders"
            :key="f.id"
            :folder="f"
            :depth="0"
            :projects-by-folder="projectsByFolder"
            @new-sub="newFolder"
            @rename="renameFolder"
            @remove="removeFolder"
            @new-project="newProject"
          />
          <ProjectLink v-for="p in rootProjects" :key="p.id" :project="p" :depth="-1" sections />
        </ul>
        <p v-else class="px-1 text-[12.5px] leading-relaxed text-ink-3">
          {{ m.projectsEmpty }}
        </p>
      </section>

      <!-- Cestino: compare solo se contiene qualcosa -->
      <section v-if="ws.trashedProjects.length">
        <div class="mb-1 flex items-center justify-between px-1">
          <h2 class="text-[11.5px] font-semibold text-ink-3">
            {{ m.trash }} <span class="tabular-nums">{{ ws.trashedProjects.length }}</span>
          </h2>
          <button
            v-if="ws.canPurge"
            class="rounded-md p-1 text-ink-3 hover:bg-danger/10 hover:text-danger"
            :title="m.emptyTrashHint"
            :aria-label="m.emptyTrash"
            @click="emptyTrash"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <ul>
          <li v-for="p in ws.trashedProjects" :key="p.id" class="group flex h-7 items-center gap-2 rounded-md pl-2.5 pr-1 text-[13px] hover:bg-surface-2">
            <RouterLink :to="{ name: 'project', params: { id: p.id } }" class="min-w-0 flex-1 truncate text-ink-2 line-through decoration-line-strong" active-class="text-accent-ink">
              {{ p.name }}
            </RouterLink>
            <span class="text-[11px] text-ink-3">{{ dayjs(p.trashedAt).fromNow(true) }}</span>
            <BaseMenu :items="trashMenu(p)">
              <MenuTriggerButton :label="m.trashedActions" :size="14" class="!p-0.5" />
            </BaseMenu>
          </li>
        </ul>
      </section>
    </div>

    <ProjectDialog v-model:open="showProject" :default-folder-id="projectDefaultFolder" />
    <NameDialog
      v-model:open="showFolder"
      :title="folderEditing ? m.renameFolder : m.newFolder"
      :initial="folderEditing?.name ?? ''"
      :placeholder="m.folderName"
      :confirm-label="folderEditing ? common.actions.rename : m.createFolder"
      @submit="submitFolder"
    />
  </aside>
</template>
