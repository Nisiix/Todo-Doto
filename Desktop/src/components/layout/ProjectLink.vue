<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Star } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Project } from '@/types'

const props = defineProps<{ project: Project; depth: number; hint?: string }>()
const ws = useWorkspaceStore()

const openCount = computed(() => props.project.items.filter((i) => i.bucket === 'todo').length)
const urgent = computed(() => props.project.items.some((i) => i.bucket === 'todo' && i.priority === 'immediata'))
</script>

<template>
  <li>
    <RouterLink
      :to="{ name: 'project', params: { id: project.id } }"
      class="flex h-7 items-center gap-2 rounded-md pr-2 text-[13px] text-ink hover:bg-surface-2"
      active-class="bg-accent-soft text-accent-ink font-semibold hover:bg-accent-soft"
      :style="{ paddingLeft: `${22 + depth * 12}px` }"
    >
      <span class="truncate">{{ project.name }}</span>
      <Star v-if="ws.isFavorite(project.id)" :size="11" class="shrink-0 fill-p-media text-p-media" />
      <span v-if="urgent" class="h-1.5 w-1.5 shrink-0 rounded-full bg-p-immediata" title="Contiene elementi immediati" />
      <span class="ml-auto shrink-0 whitespace-nowrap text-[11px] tabular-nums text-ink-3">{{ hint ?? (openCount || '') }}</span>
    </RouterLink>
  </li>
</template>
