<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ArrowRight, CalendarClock, CheckCircle2, FolderPlus, Loader2, PenLine, Plus, RotateCcw, Trash2, UserRoundCog, X } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { ITEM_CHANGES, compareStates, defaultFrom, type ItemChange, type ItemChangeKind, type ProjectChange } from '@/services/compare'
import { formatDue } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import type { BackupReason } from '@/services/backup'
import type { Project } from '@/types'
import { compareText, DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Cosa è cambiato',
    description: 'Confronta due momenti del workspace con le copie di sicurezza: cosa è stato aggiunto, completato, spostato o passato ad altri. Utile al rientro dalle ferie o prima di una riunione.',
    from: 'Dal',
    to: 'al',
    now: 'adesso',
    reason: { auto: 'copia giornaliera', manual: 'copia manuale', prerestore: 'prima di un ripristino' } as Record<BackupReason, string>,
    noBackups: 'Non c’è ancora nessuna copia di sicurezza da confrontare. Le copie si fanno da sole una volta al giorno (Impostazioni › Copie di sicurezza): dal giorno dopo si può vedere cosa è cambiato.',
    loading: 'Lettura delle copie…',
    error: (e: string) => `Non è stato possibile leggere la copia: ${e}`,
    nothing: 'Nessuna differenza fra i due momenti scelti.',
    all: 'Tutto',
    summary: (n: number) => (n === 1 ? '1 modifica' : `${n} modifiche`),
    kind: {
      added: 'Aggiunti',
      completed: 'Completati',
      reopened: 'Riaperti',
      due: 'Scadenze spostate',
      assignee: 'Passati ad altri',
      trashed: 'Nel cestino',
      restored: 'Ripristinati',
      deleted: 'Eliminati',
    } as Record<ItemChangeKind, string>,
    one: {
      added: 'aggiunto',
      completed: 'completato',
      reopened: 'riaperto',
      due: 'scadenza',
      assignee: 'responsabile',
      trashed: 'spostato nel cestino',
      restored: 'ripristinato dal cestino',
      deleted: 'eliminato definitivamente',
    } as Record<ItemChangeKind, string>,
    project: {
      project_added: 'progetto nuovo',
      project_renamed: (from: string) => `rinominato, prima «${from}»`,
      project_trashed: 'progetto nel cestino',
      project_restored: 'progetto ripristinato',
      project_deleted: 'progetto eliminato',
    },
    none: 'nessuna',
    nobody: 'nessuno',
  },
  en: {
    title: 'What changed',
    description: 'Compare two moments of the workspace using the backups: what was added, completed, moved or handed over. Handy after the holidays or before a meeting.',
    from: 'From',
    to: 'to',
    now: 'now',
    reason: { auto: 'daily backup', manual: 'manual backup', prerestore: 'before a restore' } as Record<BackupReason, string>,
    noBackups: 'There is no backup to compare yet. Backups are made automatically once a day (Settings › Backups): from the next day you can see what changed.',
    loading: 'Reading the backups…',
    error: (e: string) => `The backup could not be read: ${e}`,
    nothing: 'No differences between the two chosen moments.',
    all: 'All',
    summary: (n: number) => (n === 1 ? '1 change' : `${n} changes`),
    kind: {
      added: 'Added',
      completed: 'Completed',
      reopened: 'Reopened',
      due: 'Due dates moved',
      assignee: 'Handed over',
      trashed: 'Trashed',
      restored: 'Restored',
      deleted: 'Deleted',
    } as Record<ItemChangeKind, string>,
    one: {
      added: 'added',
      completed: 'completed',
      reopened: 'reopened',
      due: 'due date',
      assignee: 'assignee',
      trashed: 'moved to the trash',
      restored: 'restored from the trash',
      deleted: 'permanently deleted',
    } as Record<ItemChangeKind, string>,
    project: {
      project_added: 'new project',
      project_renamed: (from: string) => `renamed, previously “${from}”`,
      project_trashed: 'project trashed',
      project_restored: 'project restored',
      project_deleted: 'project deleted',
    },
    none: 'none',
    nobody: 'nobody',
  },
})

const ICON: Record<ItemChangeKind, unknown> = {
  added: Plus,
  completed: CheckCircle2,
  reopened: RotateCcw,
  due: CalendarClock,
  assignee: UserRoundCog,
  trashed: Trash2,
  restored: RotateCcw,
  deleted: X,
}

/** Confronto fra due momenti del workspace (copie di sicurezza o stato attuale). */
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()

const NOW = 'now'
const fromName = ref('')
const toName = ref(NOW)
const backups = computed(() => ws.backups)
const label = (name: string) => {
  if (name === NOW) return m.now
  const b = backups.value.find((x) => x.name === name)
  return b ? `${dayjs(b.at).format(DATE.dateTime)} · ${m.reason[b.reason]}` : name
}
const timeOf = (name: string) => (name === NOW ? Infinity : (backups.value.find((x) => x.name === name)?.at.getTime() ?? 0))

watch(
  open,
  async (o) => {
    if (!o) return
    await ws.refreshBackups()
    if (!backups.value.some((b) => b.name === fromName.value)) fromName.value = defaultFrom(backups.value)?.name ?? ''
    if (toName.value !== NOW && !backups.value.some((b) => b.name === toName.value)) toName.value = NOW
    filter.value = null
  },
  { immediate: true },
)

// Copie già lette in questa sessione (una copia non cambia); «adesso» segue lo stato attuale
const loaded = shallowRef<Record<string, Project[]>>({})
const stateOf = (name: string) => (name === NOW ? Object.values(ws.projects) : loaded.value[name])

const loading = ref(false)
const error = ref('')
watch(
  [open, fromName, toName],
  async () => {
    if (!open.value) return
    const missing = [fromName.value, toName.value].filter((n) => n && n !== NOW && !loaded.value[n])
    if (!missing.length) return
    loading.value = true
    error.value = ''
    try {
      const read = await Promise.all(missing.map(async (n) => [n, (await ws.readBackup(n)).projects] as const))
      loaded.value = { ...loaded.value, ...Object.fromEntries(read) }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

/** Si confrontano solo i progetti che si possono vedere (con i permessi di adesso, o di allora se non esiste più). */
const comparison = computed(() => {
  if (!fromName.value) return null
  // Sempre dal momento più vecchio al più recente
  const [a, b] = timeOf(fromName.value) <= timeOf(toName.value) ? [fromName.value, toName.value] : [toName.value, fromName.value]
  const before = stateOf(a)
  const after = stateOf(b)
  if (!before || !after) return null
  const seen = (p: Project) => ws.canSee(ws.projects[p.id] ?? p)
  return compareStates(before.filter(seen), after.filter(seen), compareText)
})
const filter = ref<ItemChangeKind | null>(null)
const kinds = computed(() => ITEM_CHANGES.filter((k) => comparison.value?.counts[k]))
const shown = computed(() =>
  (comparison.value?.projects ?? [])
    .map((p) => ({ ...p, items: filter.value ? p.items.filter((i) => i.kind === filter.value) : p.items, project: filter.value ? [] : p.project }))
    .filter((p) => p.items.length || p.project.length),
)

const projectText = (c: ProjectChange) => (c.kind === 'project_renamed' ? m.project.project_renamed(c.from ?? '') : m.project[c.kind])
const due = (d: string | null | undefined) => (d ? formatDue(d) : m.none)
const who = (id: string | null | undefined) => (id ? ws.userName(id) : m.nobody)
const exists = (c: ItemChange) => !!ws.projects[c.projectId]?.items.some((i) => i.id === c.itemId)

function go(c: ItemChange) {
  if (!exists(c)) return
  open.value = false
  void router.push({ name: 'project', params: { id: c.projectId }, query: { item: c.itemId } })
  ui.selectedItemId = c.itemId
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div class="space-y-3 text-[13px]" data-changes>
      <p v-if="!backups.length" class="rounded-md bg-surface-2 px-3 py-2 text-ink-2" data-changes-empty>{{ m.noBackups }}</p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-ink-2">{{ m.from }}</span>
          <select v-model="fromName" class="field h-8 w-auto min-w-0 flex-1" data-changes-from>
            <option v-for="b in backups" :key="b.name" :value="b.name">{{ label(b.name) }}</option>
          </select>
          <span class="text-ink-2">{{ m.to }}</span>
          <select v-model="toName" class="field h-8 w-auto min-w-0 flex-1" data-changes-to>
            <option :value="NOW">{{ m.now }}</option>
            <option v-for="b in backups" :key="b.name" :value="b.name">{{ label(b.name) }}</option>
          </select>
        </div>

        <p v-if="loading && !comparison" class="flex items-center gap-2 text-ink-3"><Loader2 :size="14" class="animate-spin" /> {{ m.loading }}</p>
        <p v-else-if="error" class="text-danger">{{ m.error(error) }}</p>
        <template v-else-if="comparison">
          <p v-if="!comparison.total" class="rounded-md bg-surface-2 px-3 py-2 text-ink-2" data-changes-none>{{ m.nothing }}</p>
          <template v-else>
            <div class="flex flex-wrap items-center gap-1.5" data-changes-kinds>
              <button
                type="button"
                class="rounded-full border px-2.5 py-0.5 text-[12px]"
                :class="!filter ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line hover:bg-surface-2'"
                @click="filter = null"
              >
                {{ m.all }} · {{ m.summary(comparison.total) }}
              </button>
              <button
                v-for="k in kinds"
                :key="k"
                type="button"
                class="rounded-full border px-2.5 py-0.5 text-[12px]"
                :class="filter === k ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line hover:bg-surface-2'"
                :data-changes-kind="k"
                @click="filter = filter === k ? null : k"
              >
                {{ m.kind[k] }} <span class="tabular-nums text-ink-3">{{ comparison.counts[k] }}</span>
              </button>
            </div>
            <div class="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              <section v-for="p in shown" :key="p.projectId" :data-changes-project="p.name">
                <h3 class="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  {{ p.name }}
                  <span v-for="c in p.project" :key="c.kind" class="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-ink-2" :data-changes-project-kind="c.kind">
                    <component :is="c.kind === 'project_added' ? FolderPlus : c.kind === 'project_renamed' ? PenLine : c.kind === 'project_restored' ? RotateCcw : Trash2" :size="12" />
                    {{ projectText(c) }}
                  </span>
                </h3>
                <ul v-if="p.items.length" class="mt-1 divide-y divide-line rounded-md border border-line">
                  <li v-for="c in p.items" :key="`${c.kind}:${c.itemId}`" :data-change="c.kind">
                    <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left enabled:hover:bg-surface-2 disabled:cursor-default" :disabled="!exists(c)" @click="go(c)">
                      <component :is="ICON[c.kind]" :size="14" class="shrink-0" :class="c.kind === 'completed' ? 'text-accent' : c.kind === 'deleted' || c.kind === 'trashed' ? 'text-danger' : 'text-ink-3'" />
                      <span v-if="c.seq" class="shrink-0 font-mono text-[11.5px] text-ink-3">{{ taskCode(c.seq) }}</span>
                      <span class="min-w-0 flex-1 truncate">{{ c.title }}</span>
                      <span class="flex shrink-0 items-center gap-1 text-[12px] text-ink-2">
                        <template v-if="c.kind === 'due'">{{ m.one.due }} {{ due(c.from) }} <ArrowRight :size="11" /> <b class="font-semibold">{{ due(c.to) }}</b></template>
                        <template v-else-if="c.kind === 'assignee'">{{ who(c.from) }} <ArrowRight :size="11" /> <b class="font-semibold">{{ who(c.to) }}</b></template>
                        <template v-else>{{ m.one[c.kind] }}</template>
                      </span>
                    </button>
                  </li>
                </ul>
              </section>
            </div>
          </template>
        </template>
      </template>
    </div>
  </BaseDialog>
</template>
