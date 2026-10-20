<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, FileX2, Flag, FolderX, Loader2, Moon, Tag, Trash2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useToday } from '@/composables/useToday'
import { getFs } from '@/services/fs'
import { cleanupFindings, type CleanupFinding } from '@/services/cleanup'
import { defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Pulizia guidata',
    description: 'Ciò che col tempo resta indietro nel workspace. Ogni voce ha la sua azione: non si fa nulla da solo.',
    checking: 'Controllo degli allegati sul disco…',
    none: 'Tutto in ordine: niente da sistemare.',
    unused_label: (n: string) => `Etichetta «${n}» mai usata`,
    empty_folder: (n: string) => `Cartella «${n}» vuota`,
    idle_project: (n: string, d: number, open: number) => `«${n}» fermo da ${d} giorni${open ? `, con ${open} ${plural(open, 'task', 'task')} da fare` : ''}`,
    missing_file: (n: string, p: string) => `Allegato «${n}» in «${p}»: il file non c’è più`,
    milestone_done: (n: string, p: string) => `Tappa «${n}» di «${p}»: tutti i task sono completati`,
    old_trash: (p: string, n: number) => `Cestino di «${p}»: ${n} ${plural(n, 'task', 'task')} da più di 90 giorni`,
    deleteLabel: 'Elimina',
    deleteFolder: 'Elimina',
    open: 'Apri',
    trashProject: 'Sposta nel cestino',
    removeAttachment: 'Togli l’allegato',
    closeMilestone: 'Segna come raggiunta',
    emptyTrash: 'Svuota il cestino',
  },
  en: {
    title: 'Guided cleanup',
    description: 'What gets left behind over time in the workspace. Each entry has its action: nothing happens on its own.',
    checking: 'Checking attachments on disk…',
    none: 'All tidy: nothing to fix.',
    unused_label: (n: string) => `Label “${n}” never used`,
    empty_folder: (n: string) => `Folder “${n}” is empty`,
    idle_project: (n: string, d: number, open: number) => `“${n}” idle for ${d} days${open ? `, with ${open} open ${plural(open, 'task', 'tasks')}` : ''}`,
    missing_file: (n: string, p: string) => `Attachment “${n}” in “${p}”: the file is gone`,
    milestone_done: (n: string, p: string) => `Milestone “${n}” of “${p}”: every task is completed`,
    old_trash: (p: string, n: number) => `Trash of “${p}”: ${n} ${plural(n, 'task', 'tasks')} older than 90 days`,
    deleteLabel: 'Delete',
    deleteFolder: 'Delete',
    open: 'Open',
    trashProject: 'Move to trash',
    removeAttachment: 'Remove the attachment',
    closeMilestone: 'Mark as reached',
    emptyTrash: 'Empty the trash',
  },
})

/** Pulizia guidata del workspace (amministratori). */
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const router = useRouter()
const { today } = useToday()

// Allegati di tipo file: si controlla sul disco che il percorso esista ancora
const missing = ref(new Set<string>())
const checking = ref(false)
watch(open, async (o) => {
  if (!o) return
  checking.value = true
  try {
    const fs = await getFs()
    const files = ws.visibleProjects.flatMap((p) => p.attachments.filter((a) => a.kind === 'file')).slice(0, 400)
    const results = await Promise.all(files.map(async (a) => ((await fs.exists(a.target).catch(() => true)) ? null : a.id)))
    missing.value = new Set(results.filter((x): x is string => !!x))
  } finally {
    checking.value = false
  }
})

const findings = computed(() =>
  cleanupFindings({ projects: ws.visibleProjects, labels: ws.tree.labels, folders: ws.tree.folders, today: today.value, missingFiles: missing.value }),
)

const ICON = { unused_label: Tag, empty_folder: FolderX, idle_project: Moon, missing_file: FileX2, milestone_done: Flag, old_trash: Trash2 } as const
function text(f: CleanupFinding) {
  switch (f.kind) {
    case 'unused_label': return m.unused_label(f.label.name)
    case 'empty_folder': return m.empty_folder(f.folder.name)
    case 'idle_project': return m.idle_project(f.project.name, f.days, f.open)
    case 'missing_file': return m.missing_file(f.attachment.name, f.project.name)
    case 'milestone_done': return m.milestone_done(f.milestone.name, f.project.name)
    case 'old_trash': return m.old_trash(f.project.name, f.count)
  }
}
type Action = { label: string; danger?: boolean; run: () => unknown }
function actions(f: CleanupFinding): Action[] {
  switch (f.kind) {
    case 'unused_label': return [{ label: m.deleteLabel, danger: true, run: () => ws.deleteLabel(f.label.id) }]
    case 'empty_folder': return [{ label: m.deleteFolder, danger: true, run: () => ws.deleteFolder(f.folder.id) }]
    case 'idle_project': return [
      { label: m.open, run: () => { open.value = false; void router.push({ name: 'project', params: { id: f.project.id } }) } },
      { label: m.trashProject, danger: true, run: () => ws.trashProject(f.project.id) },
    ]
    case 'missing_file': return [{ label: m.removeAttachment, danger: true, run: () => ws.removeAttachment(f.project.id, f.attachment.id) }]
    case 'milestone_done': return [{ label: m.closeMilestone, run: () => ws.updateMilestone(f.project.id, f.milestone.id, { closedAt: new Date().toISOString() }) }]
    case 'old_trash': return [{ label: m.emptyTrash, danger: true, run: () => ws.emptyTrash(f.project.id) }]
  }
}
const key = (f: CleanupFinding) =>
  f.kind === 'unused_label' ? f.label.id : f.kind === 'empty_folder' ? f.folder.id : f.kind === 'missing_file' ? f.attachment.id : f.kind === 'milestone_done' ? f.milestone.id : `${f.kind}:${f.project.id}`
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div data-cleanup>
      <p v-if="checking" class="mb-2 flex items-center gap-2 text-[12.5px] text-ink-3"><Loader2 :size="13" class="animate-spin" /> {{ m.checking }}</p>
      <p v-if="!findings.length && !checking" class="flex items-center gap-2 text-[13.5px] text-ink-2" data-cleanup-none><CheckCircle2 :size="15" class="text-ok" /> {{ m.none }}</p>
      <ul class="max-h-[60vh] divide-y divide-line overflow-y-auto">
        <li v-for="f in findings" :key="key(f)" class="flex items-center gap-3 py-2 text-[13px]" :data-cleanup-item="f.kind">
          <component :is="ICON[f.kind]" :size="15" class="shrink-0 text-ink-3" />
          <span class="min-w-0 flex-1">{{ text(f) }}</span>
          <BaseButton v-for="a in actions(f)" :key="a.label" size="sm" variant="ghost" :class="{ 'text-danger': a.danger }" @click="a.run()">{{ a.label }}</BaseButton>
        </li>
      </ul>
    </div>
  </BaseDialog>
</template>
