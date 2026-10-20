<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { CheckCircle2, ClipboardCopy, FileText, Flag, ListFilter, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { useToday } from '@/composables/useToday'
import { getFs } from '@/services/fs'
import { resolveStack, varsFor } from '@/services/scaffold'
import { milestoneProgress, prependChangelog, releaseNotes, sortMilestones } from '@/services/milestones'
import { taskCode } from '@/services/gitLink'
import type { Milestone, Project } from '@/types'
import { DATE, defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Tappe del progetto',
    description: 'Versioni o rilasci con una data obiettivo: i task si legano a una tappa dal loro dettaglio. A tappa raggiunta, le note di versione si scrivono da sole dai task completati.',
    name: 'Nome',
    namePlaceholder: 'Es. v1.3 o Rilascio al cliente',
    due: 'Data obiettivo',
    notes: 'Note (facoltative, in testa alle note di versione)',
    add: 'Aggiungi tappa',
    none: 'Nessuna tappa. Aggiungine una qui sotto.',
    progress: (d: number, t: number) => `${d} di ${t} completati`,
    empty: 'Nessun task legato',
    late: 'in ritardo',
    overdue: (n: number) => `${n} ${plural(n, 'task scaduto', 'task scaduti')}`,
    reached: 'raggiunta',
    reachedOn: (d: string) => `raggiunta il ${d}`,
    by: (d: string) => `entro il ${d}`,
    showTasks: 'Mostra i task',
    close: 'Segna come raggiunta',
    reopen: 'Riapri',
    edit: 'Modifica',
    remove: 'Elimina',
    removeTitle: (n: string) => `Eliminare la tappa «${n}»?`,
    removeMessage: 'I task restano nel progetto, senza tappa.',
    notesTitle: (n: string) => `Note di versione · ${n}`,
    releaseNotes: 'Note di versione',
    other: 'Altro',
    copy: 'Copia',
    copied: 'Note di versione copiate',
    toChangelog: 'Aggiungi a CHANGELOG.md',
    toChangelogHint: (p: string) => `In cima a ${p}`,
    changelogDone: 'Note aggiunte a CHANGELOG.md nella cartella del progetto',
    changelogFailed: 'Non è stato possibile scrivere CHANGELOG.md',
    noDone: 'Nessun task completato in questa tappa: le note sarebbero vuote.',
    back: 'Torna alle tappe',
    tagHint: (v: string) => `Per segnare la versione nel repository: git tag -a ${v} -m "${v}"`,
  },
  en: {
    title: 'Project milestones',
    description: 'Versions or releases with a target date: tasks are linked to a milestone from their details. Once reached, release notes write themselves from the completed tasks.',
    name: 'Name',
    namePlaceholder: 'E.g. v1.3 or Client release',
    due: 'Target date',
    notes: 'Notes (optional, at the top of the release notes)',
    add: 'Add milestone',
    none: 'No milestones yet. Add one below.',
    progress: (d: number, t: number) => `${d} of ${t} completed`,
    empty: 'No linked tasks',
    late: 'late',
    overdue: (n: number) => `${n} overdue ${plural(n, 'task', 'tasks')}`,
    reached: 'reached',
    reachedOn: (d: string) => `reached on ${d}`,
    by: (d: string) => `by ${d}`,
    showTasks: 'Show the tasks',
    close: 'Mark as reached',
    reopen: 'Reopen',
    edit: 'Edit',
    remove: 'Delete',
    removeTitle: (n: string) => `Delete the milestone “${n}”?`,
    removeMessage: 'Its tasks stay in the project, with no milestone.',
    notesTitle: (n: string) => `Release notes · ${n}`,
    releaseNotes: 'Release notes',
    other: 'Other',
    copy: 'Copy',
    copied: 'Release notes copied',
    toChangelog: 'Add to CHANGELOG.md',
    toChangelogHint: (p: string) => `At the top of ${p}`,
    changelogDone: 'Notes added to CHANGELOG.md in the project folder',
    changelogFailed: 'CHANGELOG.md could not be written',
    noDone: 'No completed tasks in this milestone: the notes would be empty.',
    back: 'Back to milestones',
    tagHint: (v: string) => `To mark the version in the repository: git tag -a ${v} -m "${v}"`,
  },
})

/** Tappe del progetto: avanzamento, gestione e note di versione. */
const props = defineProps<{ project: Project; readOnly?: boolean }>()
const emit = defineEmits<{ showTasks: [milestoneId: string] }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()
const { today } = useToday()

const list = computed(() => sortMilestones(props.project.milestones).map((ms) => ({ ms, p: milestoneProgress(ms, props.project.items, today.value) })))
const fmt = (d: string) => dayjs(d).format(DATE.date)

// Nuova tappa o modifica di una esistente
const editing = ref<string | null>(null)
const form = ref({ name: '', dueDate: '', notes: '' })
const resetForm = () => {
  editing.value = null
  form.value = { name: '', dueDate: '', notes: '' }
}
watch(open, (o) => {
  if (o) {
    resetForm()
    notesFor.value = null
  }
})
function startEdit(ms: Milestone) {
  editing.value = ms.id
  form.value = { name: ms.name, dueDate: ms.dueDate ?? '', notes: ms.notes }
}
async function submit() {
  const data = { name: form.value.name.trim(), dueDate: form.value.dueDate || null, notes: form.value.notes }
  if (!data.name) return
  if (editing.value) await ws.updateMilestone(props.project.id, editing.value, data)
  else await ws.addMilestone(props.project.id, data)
  resetForm()
}
async function remove(ms: Milestone) {
  if (await confirm({ title: m.removeTitle(ms.name), message: m.removeMessage, confirmLabel: m.remove, danger: true })) await ws.removeMilestone(props.project.id, ms.id)
}
const toggleClosed = (ms: Milestone) => ws.updateMilestone(props.project.id, ms.id, { closedAt: ms.closedAt ? null : new Date().toISOString() })
function showTasks(ms: Milestone) {
  open.value = false
  emit('showTasks', ms.id)
}

// Note di versione
const notesFor = ref<Milestone | null>(null)
const notesText = computed(() =>
  notesFor.value
    ? releaseNotes(notesFor.value, props.project.items, {
        labels: ws.tree.labels,
        other: m.other,
        date: fmt(notesFor.value.closedAt ?? new Date().toISOString()),
        code: (i) => (i.seq ? taskCode(i.seq) : ''),
      })
    : '',
)
const hasDone = computed(() => !!notesFor.value && props.project.items.some((i) => i.milestoneId === notesFor.value!.id && i.bucket === 'done'))
const folder = computed(() => resolveStack(props.project.stack, varsFor(props.project.name)).sourcePath.trim())
const folderOk = ref(false)
watch(
  [folder, open],
  async ([f, o]) => {
    folderOk.value = false
    if (!f || !o) return
    try {
      folderOk.value = await (await getFs()).exists(f)
    } catch {
      folderOk.value = false
    }
  },
  { immediate: true },
)
async function copy() {
  await navigator.clipboard.writeText(notesText.value)
  ui.toast(m.copied, 'success', undefined, 2500)
}
async function toChangelog() {
  try {
    const fs = await getFs()
    const path = await fs.join(folder.value, 'CHANGELOG.md')
    const existing = (await fs.exists(path)) ? await fs.readText(path) : null
    await fs.writeTextAtomic(path, prependChangelog(existing, notesText.value))
    ui.toast(m.changelogDone, 'success', undefined, 3500)
  } catch {
    ui.toast(m.changelogFailed, 'error', undefined, 5000)
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="notesFor ? m.notesTitle(notesFor.name) : m.title" :description="notesFor ? undefined : m.description" width="lg">
    <!-- Note di versione di una tappa -->
    <div v-if="notesFor" data-release-notes>
      <p v-if="!hasDone" class="text-[13px] text-ink-3">{{ m.noDone }}</p>
      <template v-else>
        <textarea class="field min-h-64 resize-y font-mono text-[12.5px] leading-relaxed" :value="notesText" readonly data-release-text />
        <p class="mt-1.5 font-mono text-[11.5px] text-ink-3">{{ m.tagHint(notesFor.name.replace(/\s+/g, '-')) }}</p>
      </template>
    </div>

    <!-- Elenco delle tappe -->
    <template v-else>
      <p v-if="!list.length" class="text-[13.5px] text-ink-3">{{ m.none }}</p>
      <ul class="max-h-[50vh] space-y-2 overflow-y-auto" data-milestones>
        <li v-for="{ ms, p } in list" :key="ms.id" class="rounded-lg border border-line p-3" :class="{ 'opacity-70': ms.closedAt }" :data-milestone="ms.name">
          <div class="flex items-baseline gap-2">
            <Flag :size="14" class="shrink-0 self-center" :class="ms.closedAt ? 'text-ok' : p.late ? 'text-danger' : 'text-accent-ink'" />
            <span class="min-w-0 flex-1 truncate text-[14px] font-semibold">{{ ms.name }}</span>
            <span class="shrink-0 text-[12px]" :class="p.late ? 'font-semibold text-danger' : 'text-ink-3'">
              <template v-if="ms.closedAt">{{ m.reachedOn(fmt(ms.closedAt)) }}</template>
              <template v-else-if="ms.dueDate">{{ m.by(fmt(ms.dueDate)) }}<template v-if="p.late"> · {{ m.late }}</template></template>
            </span>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span class="block h-full rounded-full" :class="ms.closedAt ? 'bg-ok' : 'bg-accent'" :style="{ width: `${p.percent}%` }" />
            </span>
            <span class="w-40 shrink-0 text-right text-[12px] tabular-nums text-ink-2" data-milestone-progress>{{ p.total ? m.progress(p.done, p.total) : m.empty }}</span>
          </div>
          <p v-if="p.overdue" class="mt-1 text-[12px] text-danger">{{ m.overdue(p.overdue) }}</p>
          <div class="mt-2 flex flex-wrap gap-1">
            <BaseButton v-if="p.total" size="sm" variant="ghost" data-milestone-tasks @click="showTasks(ms)"><ListFilter :size="13" /> {{ m.showTasks }}</BaseButton>
            <BaseButton size="sm" variant="ghost" data-milestone-notes @click="notesFor = ms"><FileText :size="13" /> {{ m.releaseNotes }}</BaseButton>
            <template v-if="!readOnly">
              <BaseButton size="sm" variant="ghost" :data-milestone-close="ms.closedAt ? 'reopen' : 'close'" @click="toggleClosed(ms)">
                <component :is="ms.closedAt ? RotateCcw : CheckCircle2" :size="13" /> {{ ms.closedAt ? m.reopen : m.close }}
              </BaseButton>
              <BaseButton size="icon-sm" variant="ghost" class="ml-auto" :title="m.edit" @click="startEdit(ms)"><Pencil :size="13" /></BaseButton>
              <BaseButton size="icon-sm" variant="ghost" :title="m.remove" @click="remove(ms)"><Trash2 :size="13" /></BaseButton>
            </template>
          </div>
        </li>
      </ul>

      <form v-if="!readOnly" class="mt-4 grid grid-cols-[minmax(0,1fr)_11rem] gap-x-3 gap-y-2 rounded-lg bg-surface-2 p-3" data-milestone-form @submit.prevent="submit()">
        <label class="flex flex-col gap-1 text-[12px] text-ink-3">
          {{ m.name }}
          <input v-model="form.name" class="field field-sm" :placeholder="m.namePlaceholder" data-milestone-name />
        </label>
        <label class="flex flex-col gap-1 text-[12px] text-ink-3">
          {{ m.due }}
          <input v-model="form.dueDate" type="date" class="field field-sm" data-milestone-due />
        </label>
        <label class="col-span-2 flex flex-col gap-1 text-[12px] text-ink-3">
          {{ m.notes }}
          <input v-model="form.notes" class="field field-sm" />
        </label>
        <div class="col-span-2 flex justify-end gap-2">
          <BaseButton v-if="editing" size="sm" variant="ghost" @click="resetForm()">{{ common.actions.cancel }}</BaseButton>
          <BaseButton size="sm" variant="primary" type="submit" :disabled="!form.name.trim()" data-milestone-save>
            <template v-if="editing">{{ common.actions.save }}</template><template v-else><Plus :size="13" /> {{ m.add }}</template>
          </BaseButton>
        </div>
      </form>
    </template>

    <template v-if="notesFor" #footer>
      <BaseButton variant="ghost" class="mr-auto" @click="notesFor = null">{{ m.back }}</BaseButton>
      <template v-if="hasDone">
        <BaseButton v-if="folderOk && !readOnly" variant="ghost" :title="m.toChangelogHint(folder)" data-release-changelog @click="toChangelog()"><FileText :size="14" /> {{ m.toChangelog }}</BaseButton>
        <BaseButton variant="primary" data-release-copy @click="copy()"><ClipboardCopy :size="14" /> {{ m.copy }}</BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
