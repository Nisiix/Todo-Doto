<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { Database, FolderGit2, FolderOpen, HardDrive, Moon, Network, Plus, Sun, Trash2, X } from 'lucide-vue-next'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { forgetPassword } from '@/services/config'
import { samePath } from '@/services/projectScan'
import type { RecentWorkspace } from '@/types'
import BaseButton from '@/components/ui/BaseButton.vue'
import BrandMark from '@/components/ui/BrandMark.vue'
import WorkspaceDialog from '@/components/dialogs/WorkspaceDialog.vue'
import PasswordDialog from '@/components/dialogs/PasswordDialog.vue'
import { useSessionStore } from '@/stores/session'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
import { WorkspaceStorage } from '@/services/storage'
import { scanProjects } from '@/services/projectScan'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    pickExisting: 'Apri un workspace esistente',
    headline: 'La roadmap dei tuoi progetti, in una cartella.',
    lead: 'Da fare, completati, cestino. Priorità, scadenze, domande e allegati. Sul tuo PC o su una cartella di rete condivisa con i colleghi: nessun server da installare.',
    create: 'Crea workspace',
    openFolder: 'Apri cartella',
    userOn: (u: string, h: string) => `${u} su ${h}`,
    lightTheme: 'Tema chiaro',
    darkTheme: 'Tema scuro',
    recent: 'Workspace recenti',
    removeRecent: 'Rimuovi dai recenti',
    deleteData: 'Elimina i dati di Project Goal Manager',
    deleteTitle: (n: string) => `Eliminare i dati del workspace «${n}»?`,
    deleteMessage: (data: string, projects: string) =>
      `Vengono cancellati i dati di Project Goal Manager in ${data}: elenco dei progetti, task, commenti, stack, cronologia. ` +
      (projects ? `La cartella dei progetti (${projects}) e i loro file non vengono toccati. ` : 'I file dei progetti non vengono toccati. ') +
      'Non si può annullare.',
    deleteConfirm: 'Elimina i dati',
    deleted: (n: string) => `Dati del workspace «${n}» eliminati`,
    deleteFailed: (err: string) => `Non riesco a eliminare i dati: ${err}`,
    projectsFolder: 'Cartella dei progetti',
    dataFolder: (p: string) => `Dati Project Goal Manager: ${p}`,
    actions: 'Azioni workspace',
    empty: 'Nessun workspace ancora. Creane uno nuovo oppure apri la cartella di un workspace condiviso dai colleghi.',
  },
  en: {
    pickExisting: 'Open an existing workspace',
    headline: 'Your projects’ roadmap, in a folder.',
    lead: 'To do, completed, trash. Priorities, due dates, questions and attachments. On your PC or in a network folder shared with your colleagues: no server to install.',
    create: 'Create workspace',
    openFolder: 'Open folder',
    userOn: (u: string, h: string) => `${u} on ${h}`,
    lightTheme: 'Light theme',
    darkTheme: 'Dark theme',
    recent: 'Recent workspaces',
    removeRecent: 'Remove from recent',
    deleteData: 'Delete the Project Goal Manager data',
    deleteTitle: (n: string) => `Delete the data of the workspace “${n}”?`,
    deleteMessage: (data: string, projects: string) =>
      `The Project Goal Manager data in ${data} is deleted: project list, tasks, comments, stack, activity log. ` +
      (projects ? `The projects folder (${projects}) and its files are not touched. ` : 'The project files are not touched. ') +
      'This cannot be undone.',
    deleteConfirm: 'Delete data',
    deleted: (n: string) => `Data of the workspace “${n}” deleted`,
    deleteFailed: (err: string) => `Cannot delete the data: ${err}`,
    projectsFolder: 'Projects folder',
    dataFolder: (p: string) => `Project Goal Manager data: ${p}`,
    actions: 'Workspace actions',
    empty: 'No workspaces yet. Create a new one or open the folder of a workspace shared by your colleagues.',
  },
})

const router = useRouter()
const session = useSessionStore()
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

const showCreate = ref(false)
/** Cartella di progetti scelta con "Apri cartella", passata alla creazione del workspace. */
const presetFolder = ref<string | null>(null)
const showPassword = ref(false)
const error = ref('')
const busyPath = ref<string | null>(null)

const goIn = () => router.push({ name: 'workspace-home' })

async function openPath(path: string) {
  error.value = ''
  busyPath.value = path
  const r = await ws.open(path)
  busyPath.value = null
  if (r.ok) return goIn()
  if ('needsPassword' in r) showPassword.value = true
  else error.value = r.error
}

async function browse() {
  const fs = await getFs()
  const p = await fs.pickFolder(m.pickExisting)
  if (!p) return
  // La cartella dei progetti di un workspace già noto apre quel workspace
  const known = session.config.recent.find((r) => r.projectsPath && samePath(r.projectsPath, p))
  if (known && !(await WorkspaceStorage.isWorkspace(p))) return openPath(known.path)
  // Una cartella di progetti che non è un workspace: si propone di crearne uno che li gestisca
  if (!(await WorkspaceStorage.isWorkspace(p)) && (await scanProjects(p)).length) {
    error.value = ''
    presetFolder.value = p
    showCreate.value = true
    return
  }
  await openPath(p)
}
/** Elimina i dati di Project Goal Manager di un workspace locale (non i progetti). */
async function deleteData(r: RecentWorkspace) {
  const ok = await confirm({ title: m.deleteTitle(r.name), message: m.deleteMessage(r.path, r.projectsPath), confirmLabel: m.deleteConfirm, danger: true })
  if (!ok) return
  try {
    if (ws.meta?.id === r.id) await ws.close()
    await WorkspaceStorage.deleteData(r.path)
    await forgetPassword(r.id).catch(() => {})
    await session.forgetWorkspace(r.id, r.path)
    ui.toast(m.deleted(r.name), 'success')
  } catch (e) {
    ui.toast(m.deleteFailed(e instanceof Error ? e.message : String(e)), 'error', undefined, 6000)
  }
}
const recentMenu = (r: RecentWorkspace) => [
  { label: m.removeRecent, icon: X, onSelect: () => session.removeRecent(r.path) },
  ...(r.mode === 'local' ? [{ sep: true, label: '' }, { label: m.deleteData, icon: Trash2, danger: true, onSelect: () => deleteData(r) }] : []),
]

function newWorkspace() {
  presetFolder.value = null
  showCreate.value = true
}
</script>

<template>
  <div class="grid h-full grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <!-- Colonna sinistra: identità -->
    <section class="relative flex flex-col justify-between border-r border-line bg-surface px-12 py-10">
      <div class="flex items-center gap-3">
        <BrandMark :size="30" />
        <span class="text-[15px] font-bold tracking-tight">Project Goal Manager</span>
      </div>
      <div>
        <h1 class="max-w-md text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          {{ m.headline }}
        </h1>
        <p class="mt-5 max-w-sm text-[15px] leading-relaxed text-ink-2">
          {{ m.lead }}
        </p>
        <div class="mt-8 flex gap-2">
          <BaseButton variant="primary" @click="newWorkspace"><Plus :size="16" /> {{ m.create }}</BaseButton>
          <BaseButton @click="browse"><FolderOpen :size="16" /> {{ m.openFolder }}</BaseButton>
        </div>
        <p v-if="error" class="mt-3 text-[13px] text-danger">{{ error }}</p>
      </div>
      <div class="flex items-center justify-between text-[12.5px] text-ink-3">
        <span>{{ m.userOn(session.identity.username, session.identity.hostname) }}</span>
        <button class="rounded-md p-1.5 hover:bg-surface-2 hover:text-ink" :title="ui.isDark ? m.lightTheme : m.darkTheme" @click="ui.toggleTheme()">
          <Sun v-if="ui.isDark" :size="16" />
          <Moon v-else :size="16" />
        </button>
      </div>
    </section>

    <!-- Colonna destra: recenti -->
    <section class="flex flex-col overflow-y-auto px-12 py-10">
      <h2 class="text-[13px] font-semibold text-ink-2">{{ m.recent }}</h2>
      <ul v-if="session.config.recent.length" class="mt-3 divide-y divide-line">
        <li v-for="r in session.config.recent" :key="r.path" class="group flex items-center gap-3 py-3">
          <component :is="r.mode === 'network' ? Network : HardDrive" :size="18" class="shrink-0 text-accent" />
          <button class="min-w-0 flex-1 text-left" :disabled="busyPath !== null" :title="m.dataFolder(r.path)" @click="openPath(r.path)">
            <span class="block truncate font-semibold group-hover:text-accent-ink">{{ r.name }}</span>
            <!-- Il percorso mostrato è quello dei progetti; i dati dell'app sono nel suggerimento -->
            <span class="flex items-center gap-1 truncate font-mono text-[12px] text-ink-3">
              <component :is="r.projectsPath ? FolderGit2 : Database" :size="11" class="shrink-0" />
              <span class="truncate" data-recent-path>{{ r.projectsPath || r.path }}</span>
            </span>
          </button>
          <span class="shrink-0 text-[12px] text-ink-3">{{ dayjs(r.lastOpened).fromNow() }}</span>
          <BaseMenu :items="recentMenu(r)">
            <MenuTriggerButton :label="m.actions" :size="15" />
          </BaseMenu>
        </li>
      </ul>
      <div v-else class="mt-3 rounded-lg border border-dashed border-line-strong p-6 text-[13.5px] text-ink-2">
        {{ m.empty }}
      </div>
    </section>

    <WorkspaceDialog v-model:open="showCreate" :preset-folder="presetFolder" @opened="goIn" />
    <PasswordDialog v-model:open="showPassword" @unlocked="goIn" />
  </div>
</template>
