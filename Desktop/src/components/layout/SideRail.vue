<script setup lang="ts">
import { t, tn } from '@/i18n'
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

const ws = useWorkspaceStore()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()

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
    title: t('Eliminare la cartella «{name}»?', { name: f.name }),
    message:
      `Verranno eliminate anche tutte le sottocartelle. ` +
      (inside ? `I ${inside} progetti contenuti finiscono nel Cestino, da dove puoi ripristinarli.` : 'Non contiene progetti.'),
    confirmLabel: t('Elimina cartella'),
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
    title: t('Eliminare definitivamente «{name}»?', { name: p.name }),
    message: t('{items} elementi e {attachments} allegati verranno eliminati per tutti. Non si può annullare.', { items: p.items.length, attachments: p.attachments.length }),
    confirmLabel: t('Elimina per sempre'),
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
    title: t('Svuotare il cestino dei progetti?'),
    message: tn(n, '1 progetto verrà eliminato definitivamente, con tutti gli elementi e gli allegati. Non si può annullare.', '{n} progetti verranno eliminati definitivamente, con tutti gli elementi e gli allegati. Non si può annullare.'),
    confirmLabel: t('Svuota cestino'),
    danger: true,
  })
  if (ok) {
    ws.trashedProjects.forEach((p) => leaveIfOpen(p.id))
    await ws.emptyProjectTrash()
  }
}
const trashMenu = (p: Project) => [
  { label: t('Ripristina'), icon: RotateCcw, onSelect: () => ws.restoreProject(p.id) },
  ...(ws.canPurge ? [{ label: t('Elimina definitivamente'), icon: X, danger: true, onSelect: () => deleteForever(p) }] : []),
]
</script>

<template>
  <aside class="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
    <div class="flex items-center gap-1 px-3 pt-3">
      <BaseButton variant="primary" size="sm" class="flex-1" @click="newProject(null)"><Plus :size="14" /> {{ t('Progetto') }}</BaseButton>
      <BaseButton size="icon-sm" :title="t('Nuova cartella')" @click="newFolder(null)"><FolderPlus :size="14" /></BaseButton>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-4 pt-3">
      <!-- Preferiti -->
      <section class="mb-4">
        <h2 class="mb-1 px-1 text-[11.5px] font-semibold text-ink-3">{{ t('Preferiti') }}</h2>
        <ul v-if="ws.favoriteProjects.length">
          <ProjectLink v-for="p in ws.favoriteProjects" :key="p.id" :project="p" :depth="-1" />
        </ul>
        <p v-else class="px-1 text-[12px] text-ink-3">{{ t('Segna un progetto con la stella per trovarlo qui.') }}</p>
      </section>

      <!-- Recenti -->
      <section v-if="ws.recentProjects.length" class="mb-4">
        <h2 class="mb-1 px-1 text-[11.5px] font-semibold text-ink-3">{{ t('Recenti') }}</h2>
        <ul>
          <ProjectLink v-for="p in ws.recentProjects" :key="p.id" :project="p" :depth="-1" :hint="dayjs(p.updatedAt).fromNow(true)" />
        </ul>
      </section>

      <!-- Progetti -->
      <section class="mb-4">
        <h2 class="mb-1 px-1 text-[11.5px] font-semibold text-ink-3">{{ t('Progetti') }}</h2>
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
          <ProjectLink v-for="p in rootProjects" :key="p.id" :project="p" :depth="-1" />
        </ul>
        <p v-else class="px-1 text-[12.5px] leading-relaxed text-ink-3">
          {{ t('Nessun progetto. Creane uno con il pulsante qui sopra.') }}
        </p>
      </section>

      <!-- Cestino -->
      <section>
        <div class="mb-1 flex items-center justify-between px-1">
          <h2 class="text-[11.5px] font-semibold text-ink-3">
            {{ t('Cestino') }} <span class="tabular-nums">{{ ws.trashedProjects.length || '' }}</span>
          </h2>
          <button
            v-if="ws.trashedProjects.length && ws.canPurge"
            class="rounded-md p-1 text-ink-3 hover:bg-danger/10 hover:text-danger"
            :title="t('Svuota il cestino: elimina definitivamente tutti i progetti cestinati')"
            :aria-label="t('Svuota cestino')"
            @click="emptyTrash"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <ul v-if="ws.trashedProjects.length">
          <li v-for="p in ws.trashedProjects" :key="p.id" class="group flex h-7 items-center gap-2 rounded-md pl-2.5 pr-1 text-[13px] hover:bg-surface-2">
            <RouterLink :to="{ name: 'project', params: { id: p.id } }" class="min-w-0 flex-1 truncate text-ink-2 line-through decoration-line-strong" active-class="text-accent-ink">
              {{ p.name }}
            </RouterLink>
            <span class="text-[11px] text-ink-3">{{ dayjs(p.trashedAt).fromNow(true) }}</span>
            <BaseMenu :items="trashMenu(p)">
              <MenuTriggerButton :label="t('Azioni progetto cestinato')" :size="14" class="!p-0.5" />
            </BaseMenu>
          </li>
        </ul>
        <p v-else class="px-1 text-[12px] text-ink-3">{{ t('Vuoto.') }}</p>
      </section>
    </div>

    <ProjectDialog v-model:open="showProject" :default-folder-id="projectDefaultFolder" />
    <NameDialog
      v-model:open="showFolder"
      :title="folderEditing ? 'Rinomina cartella' : 'Nuova cartella'"
      :initial="folderEditing?.name ?? ''"
      :placeholder="t('Nome cartella')"
      :confirm-label="folderEditing ? 'Rinomina' : 'Crea cartella'"
      @submit="submitFolder"
    />
  </aside>
</template>
