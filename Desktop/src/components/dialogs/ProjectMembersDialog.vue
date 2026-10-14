<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ProjectAccessFields, { resolveMembers, type ProjectAccess } from '@/components/project/ProjectAccessFields.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Gestione utenti',
    errMembers: 'Scegli almeno una persona, oppure apri il progetto a tutti.',
    saved: 'Utenti del progetto aggiornati',
  },
  en: {
    title: 'Manage users',
    errMembers: 'Choose at least one person, or open the project to everyone.',
    saved: 'Project users updated',
  },
})

/** Chi può vedere e modificare il progetto (workspace di rete, solo amministratori). */
const props = defineProps<{ project: Project }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()

const access = ref<ProjectAccess>('all')
const members = ref<string[]>([])
const error = ref('')
watch(open, (o) => {
  if (!o) return
  members.value = [...props.project.members]
  access.value = members.value.length ? 'restricted' : 'all'
  error.value = ''
})

async function save() {
  const ids = resolveMembers(ws.users, access.value, members.value)
  if (!ids) return (error.value = m.errMembers)
  await ws.updateProject(props.project.id, { members: ids })
  open.value = false
  ui.toast(m.saved, 'success', undefined, 2000)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="project.name">
    <form @submit.prevent="save">
      <ProjectAccessFields v-model:access="access" v-model:members="members" />
      <p v-if="error" class="mt-3 text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" @click="save">{{ common.actions.save }}</BaseButton>
    </template>
  </BaseDialog>
</template>
