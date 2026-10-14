<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Layers, ListChecks, Paperclip, Star, Trash2 } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import VisibilityDot from '@/components/ui/VisibilityDot.vue'
import { sectionParam, type ProjectSection } from '@/services/sections'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    urgent: 'Contiene elementi immediati',
    trash: (n: string) => `Sposta «${n}» nel cestino del workspace (la cartella sul disco non viene toccata)`,
    sections: (n: string) => `Sezioni di ${n}`,
    todo: 'Todo',
    stack: 'Stack',
    attachments: 'Allegati',
  },
  en: {
    urgent: 'Contains urgent items',
    trash: (n: string) => `Move “${n}” to the workspace trash (the folder on disk is not touched)`,
    sections: (n: string) => `Sections of ${n}`,
    todo: 'To-do',
    stack: 'Stack',
    attachments: 'Attachments',
  },
})

/**
 * Voce di un progetto nella barra laterale. Con `sections` (albero dei
 * progetti) il progetto aperto mostra sotto di sé il sottomenu Todo, Stack,
 * Allegati. A destra, al passaggio del mouse, il cestino (solo amministratori).
 */
const props = defineProps<{ project: Project; depth: number; hint?: string; sections?: boolean }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const route = useRoute()

const openCount = computed(() => props.project.items.filter((i) => i.bucket === 'todo').length)
const urgent = computed(() => props.project.items.some((i) => i.bucket === 'todo' && i.priority === 'immediata'))
const isOpen = computed(() => route.name === 'project' && route.params.id === props.project.id)
const canTrash = computed(() => ws.isAdmin && !props.project.trashedAt)
const indent = (extra = 0) => ({ paddingLeft: `${22 + props.depth * 12 + extra}px` })

const subItems = computed<{ id: ProjectSection; label: string; icon: unknown; count: number }[]>(() => [
  { id: 'todo', label: m.todo, icon: ListChecks, count: openCount.value },
  { id: 'stack', label: m.stack, icon: Layers, count: props.project.stack.steps.length + props.project.aiTools.length },
  { id: 'attachments', label: m.attachments, icon: Paperclip, count: props.project.attachments.length },
])

function trash() {
  const id = props.project.id
  ws.trashProject(id)
  ui.toast(common.projectFiles.trashedProject, 'info', { label: common.actions.undo, run: () => ws.restoreProject(id) }, 5000)
}
</script>

<template>
  <li>
    <div class="group relative">
      <RouterLink
        :to="{ name: 'project', params: { id: project.id } }"
        class="flex h-7 items-center gap-2 rounded-md pr-2 text-[13px] text-ink hover:bg-surface-2"
        active-class="bg-accent-soft text-accent-ink font-semibold hover:bg-accent-soft"
        :style="indent()"
      >
        <span class="truncate">{{ project.name }}</span>
        <!-- Visibilità (workspace di rete): verde pubblica, arancione limitata -->
        <VisibilityDot v-if="ws.isNetwork" :project="project" />
        <Star v-if="ws.isFavorite(project.id)" :size="11" class="shrink-0 fill-p-media text-p-media" />
        <span v-if="urgent" class="h-1.5 w-1.5 shrink-0 rounded-full bg-p-immediata" :title="m.urgent" />
        <span class="ml-auto shrink-0 whitespace-nowrap text-[11px] tabular-nums text-ink-3" :class="{ 'group-hover:invisible group-focus-within:invisible': canTrash }">
          {{ hint ?? (openCount || '') }}
        </span>
      </RouterLink>
      <button
        v-if="canTrash"
        type="button"
        class="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-ink-3 hover:bg-danger/10 hover:text-danger focus-visible:flex group-hover:flex group-focus-within:flex"
        :title="m.trash(project.name)"
        :aria-label="m.trash(project.name)"
        @click="trash"
      >
        <Trash2 :size="13" />
      </button>
    </div>

    <ul v-if="sections && isOpen" class="mb-1 mt-0.5" :aria-label="m.sections(project.name)">
      <li v-for="s in subItems" :key="s.id">
        <RouterLink
          :to="{ name: 'project', params: s.id === 'todo' ? { id: project.id } : { id: project.id, section: sectionParam(s.id) } }"
          class="flex h-7 items-center gap-2 rounded-md pr-2 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          exact-active-class="!text-accent-ink font-semibold"
          :style="indent(12)"
        >
          <component :is="s.icon" :size="13" class="shrink-0" />
          <span class="truncate">{{ s.label }}</span>
          <span class="ml-auto shrink-0 text-[11px] tabular-nums text-ink-3">{{ s.count || '' }}</span>
        </RouterLink>
      </li>
    </ul>
  </li>
</template>
