<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { FolderOpen, HardDrive, Moon, Network, Plus, Sun, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BrandMark from '@/components/ui/BrandMark.vue'
import WorkspaceDialog from '@/components/dialogs/WorkspaceDialog.vue'
import PasswordDialog from '@/components/dialogs/PasswordDialog.vue'
import { useSessionStore } from '@/stores/session'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
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
    empty: 'No workspaces yet. Create a new one or open the folder of a workspace shared by your colleagues.',
  },
})

const router = useRouter()
const session = useSessionStore()
const ws = useWorkspaceStore()
const ui = useUiStore()

const showCreate = ref(false)
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
  if (p) await openPath(p)
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
          <BaseButton variant="primary" @click="showCreate = true"><Plus :size="16" /> {{ m.create }}</BaseButton>
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
          <button class="min-w-0 flex-1 text-left" :disabled="busyPath !== null" @click="openPath(r.path)">
            <span class="block truncate font-semibold group-hover:text-accent-ink">{{ r.name }}</span>
            <span class="block truncate font-mono text-[12px] text-ink-3">{{ r.path }}</span>
          </button>
          <span class="shrink-0 text-[12px] text-ink-3">{{ dayjs(r.lastOpened).fromNow() }}</span>
          <button
            class="shrink-0 rounded-md p-1 text-ink-3 opacity-0 hover:bg-surface-2 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
            :title="m.removeRecent"
            @click="session.removeRecent(r.path)"
          >
            <X :size="14" />
          </button>
        </li>
      </ul>
      <div v-else class="mt-3 rounded-lg border border-dashed border-line-strong p-6 text-[13.5px] text-ink-2">
        {{ m.empty }}
      </div>
    </section>

    <WorkspaceDialog v-model:open="showCreate" @opened="goIn" />
    <PasswordDialog v-model:open="showPassword" @unlocked="goIn" />
  </div>
</template>
