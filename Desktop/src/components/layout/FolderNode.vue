<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-vue-next'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import ProjectLink from './ProjectLink.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Folder as FolderT, Project } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: { newProject: 'Nuovo progetto qui', newSub: 'Nuova sottocartella', delete: 'Elimina cartella', actions: 'Azioni cartella' },
  en: { newProject: 'New project here', newSub: 'New subfolder', delete: 'Delete folder', actions: 'Folder actions' },
})

const props = defineProps<{ folder: FolderT; depth: number; projectsByFolder: Record<string, Project[]> }>()
const emit = defineEmits<{
  newSub: [parentId: string]
  rename: [folder: FolderT]
  remove: [folder: FolderT]
  newProject: [folderId: string]
}>()
const ws = useWorkspaceStore()

const openKey = `pgm:fold:${props.folder.id}`
const open = ref(localStorage.getItem(openKey) !== '0')
function toggle() {
  open.value = !open.value
  localStorage.setItem(openKey, open.value ? '1' : '0')
}

const children = computed(() => ws.foldersByParent[props.folder.id] ?? [])

// La cartella che contiene il progetto aperto si apre da sola, così il suo
// sottomenu (Todo, Stack, Allegati) è visibile.
const route = useRoute()
const containsOpen = computed(() => {
  if (route.name !== 'project') return false
  const id = route.params.id
  return ws.projectsInFolderTree(props.folder.id).some((p) => p.id === id)
})
watch(containsOpen, (v) => v && (open.value = true), { immediate: true })
const projects = computed(() => props.projectsByFolder[props.folder.id] ?? [])
const count = computed(() => {
  let n = projects.value.length
  const walk = (id: string) => {
    for (const c of ws.foldersByParent[id] ?? []) {
      n += props.projectsByFolder[c.id]?.length ?? 0
      walk(c.id)
    }
  }
  walk(props.folder.id)
  return n
})

const menu = computed(() => [
  { label: m.newProject, icon: FolderPlus, onSelect: () => emit('newProject', props.folder.id) },
  { label: m.newSub, icon: Folder, onSelect: () => emit('newSub', props.folder.id) },
  { label: common.actions.rename, icon: Pencil, onSelect: () => emit('rename', props.folder) },
  { sep: true, label: '' },
  { label: m.delete, icon: Trash2, danger: true, onSelect: () => emit('remove', props.folder) },
])
</script>

<template>
  <li>
    <div
      class="group flex h-7 items-center gap-1 rounded-md pr-1 text-[13px] text-ink-2 hover:bg-surface-2"
      :style="{ paddingLeft: `${4 + depth * 12}px` }"
    >
      <button class="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left" @click="toggle">
        <ChevronRight :size="13" class="shrink-0 transition-transform" :class="{ 'rotate-90': open }" />
        <span class="truncate font-medium">{{ folder.name }}</span>
        <span class="ml-auto text-[11px] text-ink-3">{{ count || '' }}</span>
      </button>
      <!-- Cartelle e progetti si creano e si gestiscono solo da amministratore -->
      <BaseMenu v-if="ws.isAdmin" :items="menu">
        <MenuTriggerButton :label="m.actions" :size="14" class="!p-0.5" />
      </BaseMenu>
    </div>
    <ul v-show="open">
      <FolderNode
        v-for="c in children"
        :key="c.id"
        :folder="c"
        :depth="depth + 1"
        :projects-by-folder="projectsByFolder"
        @new-sub="emit('newSub', $event)"
        @rename="emit('rename', $event)"
        @remove="emit('remove', $event)"
        @new-project="emit('newProject', $event)"
      />
      <ProjectLink v-for="p in projects" :key="p.id" :project="p" :depth="depth + 1" sections />
    </ul>
  </li>
</template>
