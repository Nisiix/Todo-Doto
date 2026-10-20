<script setup lang="ts">
import { ref, watch } from 'vue'
import dayjs from 'dayjs'
import { LayoutTemplate, Trash2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import type { Project, ProjectTemplate } from '@/types'
import { DATE, defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Modelli di progetto',
    description: 'Un modello porta in un progetto nuovo lo Stack, le cartelle degli allegati, le tappe e i task, con le date spostate a partire dal giorno in cui lo si usa. Si sceglie in «Nuovo progetto».',
    saveTitle: (p: string) => `Salva «${p}» come modello`,
    name: 'Nome del modello',
    description2: 'Descrizione (facoltativa)',
    save: 'Salva come modello',
    saved: (n: string) => `Modello «${n}» salvato`,
    list: 'Modelli salvati',
    none: 'Nessun modello salvato.',
    counts: (t: number, ms: number) => `${t} ${plural(t, 'task', 'task')} · ${ms} ${plural(ms, 'tappa', 'tappe')}`,
    by: (who: string, when: string) => `di ${who}, ${when}`,
    remove: 'Elimina',
    removeTitle: (n: string) => `Eliminare il modello «${n}»?`,
    removeMessage: 'I progetti creati da questo modello non cambiano.',
  },
  en: {
    title: 'Project templates',
    description: 'A template brings into a new project the Stack, the attachment folders, milestones and tasks, with dates moved to start from the day it is used. It is picked in “New project”.',
    saveTitle: (p: string) => `Save “${p}” as a template`,
    name: 'Template name',
    description2: 'Description (optional)',
    save: 'Save as template',
    saved: (n: string) => `Template “${n}” saved`,
    list: 'Saved templates',
    none: 'No saved templates.',
    counts: (t: number, ms: number) => `${t} ${plural(t, 'task', 'tasks')} · ${ms} ${plural(ms, 'milestone', 'milestones')}`,
    by: (who: string, when: string) => `by ${who}, ${when}`,
    remove: 'Delete',
    removeTitle: (n: string) => `Delete the template “${n}”?`,
    removeMessage: 'Projects created from this template do not change.',
  },
})

/** Modelli del workspace: salva il progetto aperto come modello, elimina quelli che non servono più. */
const props = defineProps<{ project: Project | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

const list = ref<ProjectTemplate[]>([])
const name = ref('')
const description = ref('')
const reload = async () => (list.value = await ws.readTemplates())
watch(open, (o) => {
  if (!o) return
  name.value = props.project?.name ?? ''
  description.value = props.project?.description ?? ''
  void reload()
})
async function save() {
  if (!props.project || !name.value.trim()) return
  const t = await ws.saveAsTemplate(props.project.id, name.value, description.value)
  if (t) ui.toast(m.saved(t.name), 'success', undefined, 2500)
  await reload()
}
async function remove(t: ProjectTemplate) {
  if (!(await confirm({ title: m.removeTitle(t.name), message: m.removeMessage, confirmLabel: m.remove, danger: true }))) return
  await ws.deleteTemplate(t.id)
  await reload()
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div class="space-y-5" data-templates>
      <form v-if="project && ws.isAdmin" class="space-y-2 rounded-lg bg-surface-2 p-3" @submit.prevent="save()">
        <p class="text-[13px] font-semibold">{{ m.saveTitle(project.name) }}</p>
        <label class="flex flex-col gap-1 text-[12px] text-ink-3">{{ m.name }}<input v-model="name" class="field field-sm" data-template-name /></label>
        <label class="flex flex-col gap-1 text-[12px] text-ink-3">{{ m.description2 }}<input v-model="description" class="field field-sm" /></label>
        <div class="flex justify-end"><BaseButton size="sm" variant="primary" type="submit" :disabled="!name.trim()" data-template-save><LayoutTemplate :size="13" /> {{ m.save }}</BaseButton></div>
      </form>
      <section>
        <h3 class="mb-1.5 text-[12px] font-semibold text-ink-3">{{ m.list }}</h3>
        <p v-if="!list.length" class="text-[13px] text-ink-3">{{ m.none }}</p>
        <ul class="divide-y divide-line">
          <li v-for="t in list" :key="t.id" class="flex items-center gap-3 py-2 text-[13px]" :data-template="t.name">
            <LayoutTemplate :size="15" class="shrink-0 text-ink-3" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ t.name }}</span>
              <span class="block truncate text-[12px] text-ink-3">{{ m.counts(t.tasks.length, t.milestones.length) }} · {{ m.by(ws.userName(t.createdBy), dayjs(t.createdAt).format(DATE.date)) }}</span>
            </span>
            <BaseButton v-if="ws.isAdmin" size="icon-sm" variant="ghost" :title="m.remove" @click="remove(t)"><Trash2 :size="13" /></BaseButton>
          </li>
        </ul>
      </section>
    </div>
  </BaseDialog>
</template>
