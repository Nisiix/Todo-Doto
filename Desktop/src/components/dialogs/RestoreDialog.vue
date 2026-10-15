<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ArchiveRestore, Loader2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { summarizeBackup, type BackupBundle, type BackupInfo } from '@/services/backup'
import { compareText } from '@/i18n'
import { defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Ripristina da una copia',
    description: 'Scegli una copia: puoi rimettere tutto il workspace com’era, oppure un solo progetto. Prima del ripristino viene creata una copia dello stato attuale, così puoi tornare indietro.',
    reason: { auto: 'automatica', manual: 'manuale', prerestore: 'prima di un ripristino' } as Record<string, string>,
    none: 'Nessuna copia ancora. La prima automatica si crea poco dopo l’apertura del workspace, oppure usa «Crea copia ora».',
    reading: 'Lettura della copia…',
    unreadable: (e: string) => `Copia non leggibile: ${e}`,
    by: (who: string, host: string) => `di ${who}${host ? ` su ${host}` : ''}`,
    summary: (p: number, i: number) => `${p} ${plural(p, 'progetto', 'progetti')}, ${i} task`,
    restoreAll: 'Ripristina tutto',
    restoreAllTitle: 'Ripristinare tutto il workspace?',
    restoreAllMessage: (d: string) =>
      `Progetti, task, cartelle, etichette, utenti e cronologia tornano com’erano il ${d}, per tutti. I progetti creati dopo vengono tolti dal workspace. Prima viene creata una copia dello stato attuale. ${common.projectFiles.untouchedShort}`,
    project: 'Oppure un solo progetto',
    pick: 'Scegli un progetto…',
    restoreOne: 'Ripristina il progetto',
    restoreOneTitle: (n: string) => `Ripristinare «${n}»?`,
    restoreOneMessage: (d: string) => `Il progetto torna com’era il ${d} (se esiste ancora, la versione attuale viene sostituita). Gli altri progetti restano come sono. Prima viene creata una copia dello stato attuale.`,
    restored: 'Ripristino completato',
    failed: (e: string) => `Ripristino non riuscito: ${e}`,
    notInWs: 'non più nel workspace',
  },
  en: {
    title: 'Restore from a backup',
    description: 'Choose a backup: you can put the whole workspace back as it was, or a single project. Before restoring, a backup of the current state is created, so you can go back.',
    reason: { auto: 'automatic', manual: 'manual', prerestore: 'before a restore' } as Record<string, string>,
    none: 'No backups yet. The first automatic one is created shortly after the workspace opens, or use “Back up now”.',
    reading: 'Reading the backup…',
    unreadable: (e: string) => `Backup not readable: ${e}`,
    by: (who: string, host: string) => `by ${who}${host ? ` on ${host}` : ''}`,
    summary: (p: number, i: number) => `${p} ${plural(p, 'project', 'projects')}, ${i} tasks`,
    restoreAll: 'Restore everything',
    restoreAllTitle: 'Restore the whole workspace?',
    restoreAllMessage: (d: string) =>
      `Projects, tasks, folders, labels, users and history go back to how they were on ${d}, for everyone. Projects created later are removed from the workspace. A backup of the current state is created first. ${common.projectFiles.untouchedShort}`,
    project: 'Or a single project',
    pick: 'Choose a project…',
    restoreOne: 'Restore the project',
    restoreOneTitle: (n: string) => `Restore “${n}”?`,
    restoreOneMessage: (d: string) => `The project goes back to how it was on ${d} (if it still exists, the current version is replaced). The other projects stay as they are. A backup of the current state is created first.`,
    restored: 'Restore completed',
    failed: (e: string) => `Restore failed: ${e}`,
    notInWs: 'no longer in the workspace',
  },
})

/** Ripristino da una copia di sicurezza (amministratori): tutto, o un solo progetto. */
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

const selected = ref<BackupInfo | null>(null)
const bundle = ref<BackupBundle | null>(null)
const loading = ref(false)
const error = ref('')
const projectId = ref('')
const busy = ref(false)

watch(open, (o) => {
  if (!o) return
  void ws.refreshBackups()
  selected.value = null
  bundle.value = null
  error.value = ''
  projectId.value = ''
})

async function choose(b: BackupInfo) {
  selected.value = b
  bundle.value = null
  error.value = ''
  projectId.value = ''
  loading.value = true
  try {
    const read = await ws.readBackup(b.name)
    if (selected.value?.name === b.name) bundle.value = read
  } catch (e) {
    error.value = m.unreadable(e instanceof Error ? e.message : String(e))
  } finally {
    loading.value = false
  }
}

const when = (d: Date | string) => dayjs(d).format('D MMM YYYY, HH:mm')
const summary = computed(() => (bundle.value ? summarizeBackup(bundle.value) : null))
const projectsInBackup = computed(() => [...(bundle.value?.projects ?? [])].sort((a, b) => compareText(a.name, b.name)))

async function run(projectOnly: boolean) {
  const b = selected.value
  if (!b || !bundle.value) return
  const p = projectOnly ? bundle.value.projects.find((x) => x.id === projectId.value) : null
  if (projectOnly && !p) return
  const ok = await confirm(
    p
      ? { title: m.restoreOneTitle(p.name), message: m.restoreOneMessage(when(b.at)), confirmLabel: m.restoreOne, danger: true }
      : { title: m.restoreAllTitle, message: m.restoreAllMessage(when(b.at)), confirmLabel: m.restoreAll, danger: true },
  )
  if (!ok) return
  busy.value = true
  try {
    await ws.restoreBackup(b.name, p?.id)
    ui.toast(m.restored, 'success', undefined, 4000)
    open.value = false
  } catch (e) {
    ui.toast(m.failed(e instanceof Error ? e.message : String(e)), 'error', undefined, 7000)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <p v-if="!ws.backups.length" class="text-[13px] text-ink-2">{{ m.none }}</p>
    <div v-else class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
      <ul class="max-h-80 space-y-0.5 overflow-y-auto pr-1" data-backup-list>
        <li v-for="b in ws.backups" :key="b.name">
          <button
            class="w-full rounded-md px-2.5 py-1.5 text-left text-[13px]"
            :class="selected?.name === b.name ? 'bg-accent-soft text-accent-ink' : 'hover:bg-surface-2'"
            @click="choose(b)"
          >
            <span class="block font-semibold tabular-nums">{{ when(b.at) }}</span>
            <span class="block text-[11.5px] text-ink-3">{{ m.reason[b.reason] }}</span>
          </button>
        </li>
      </ul>

      <div class="min-w-0 rounded-lg border border-line p-4 text-[13px]">
        <p v-if="!selected" class="text-ink-3"><ArchiveRestore :size="14" class="mr-1 inline" /> {{ m.description.split('.')[0] }}.</p>
        <p v-else-if="loading" class="flex items-center gap-1.5 text-ink-2"><Loader2 :size="13" class="animate-spin" /> {{ m.reading }}</p>
        <p v-else-if="error" class="text-danger">{{ error }}</p>
        <template v-else-if="bundle && summary">
          <p class="font-semibold">{{ when(bundle.createdAt) }}</p>
          <p class="text-[12px] text-ink-3">{{ m.by(bundle.createdBy, bundle.host) }}</p>
          <p class="mt-2 text-ink-2" data-backup-summary>{{ m.summary(summary.projects, summary.items) }}</p>
          <BaseButton class="mt-3" variant="danger" size="sm" :disabled="busy" @click="run(false)">{{ m.restoreAll }}</BaseButton>

          <div class="mt-5 border-t border-line pt-4">
            <label class="label" for="r-project">{{ m.project }}</label>
            <div class="flex gap-2">
              <select id="r-project" v-model="projectId" class="field field-sm min-w-0 flex-1">
                <option value="">{{ m.pick }}</option>
                <option v-for="p in projectsInBackup" :key="p.id" :value="p.id">{{ p.name }}{{ ws.projects[p.id] ? '' : ` (${m.notInWs})` }}</option>
              </select>
              <BaseButton size="sm" :disabled="!projectId || busy" @click="run(true)">{{ m.restoreOne }}</BaseButton>
            </div>
          </div>
        </template>
      </div>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.close }}</BaseButton>
    </template>
  </BaseDialog>
</template>
