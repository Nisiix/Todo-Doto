<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { FolderOpen, HardDrive, MessageSquare, Moon, Network, Plus, Sparkles, Sun, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BrandMark from '@/components/ui/BrandMark.vue'
import WorkspaceDialog from '@/components/dialogs/WorkspaceDialog.vue'
import PasswordDialog from '@/components/dialogs/PasswordDialog.vue'
import { useSessionStore } from '@/stores/session'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
import { openOrCreateDemo } from '@/services/demo'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const ws = useWorkspaceStore()
const ui = useUiStore()

const showCreate = ref(false)
const showPassword = ref(false)
const error = ref('')
const busyPath = ref<string | null>(null)
const demoBusy = ref(false)

const goIn = () => router.push({ name: 'workspace-home' })

onMounted(() => {
  if (route.query.create === '1') showCreate.value = true
})

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
  const p = await fs.pickFolder('Apri un workspace esistente')
  if (p) await openPath(p)
}

async function tryDemo() {
  error.value = ''
  demoBusy.value = true
  const r = await openOrCreateDemo(ws)
  demoBusy.value = false
  if (r.ok) goIn()
  else if ('error' in r) error.value = r.error
}

/** Guida rapida mostrata al posto dei recenti finché non ce ne sono. */
const steps = [
  { icon: Plus, title: t('Crea un workspace'), text: t('Una cartella sul tuo PC per lavorare da solo, oppure su un server di rete per condividerla con i colleghi (con una password).') },
  { icon: FolderOpen, title: t('Organizza i progetti'), text: t('Cartelle e sottocartelle, preferiti, recenti. Ogni progetto ha la sua lista di cose da fare, i completati e un cestino.') },
  { icon: MessageSquare, title: t('Lavora insieme'), text: t('Priorità, stato, scadenza ed etichetta per ogni elemento; domande e commenti con @menzioni; allegati. Le modifiche dei colleghi arrivano da sole.') },
  { icon: Sparkles, title: t('Gratis per iniziare'), text: t('Uso personale senza limiti e fino a tre persone in rete. I piani Team e Business aggiungono posti, cronologia, export e backup.') },
]
</script>

<template>
  <div class="grid h-full grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <!-- Colonna sinistra: identità -->
    <section class="relative flex flex-col justify-between border-r border-line bg-surface px-12 py-10">
      <div class="flex items-center gap-3">
        <BrandMark :size="30" />
        <span class="text-[15px] font-bold tracking-tight">{{ t('Project Goal Manager') }}</span>
      </div>
      <div>
        <h1 class="max-w-md text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          {{ t('La roadmap dei tuoi progetti, in una cartella.') }}
        </h1>
        <p class="mt-5 max-w-sm text-[15px] leading-relaxed text-ink-2">
          {{ t('Da fare, completati, cestino. Priorità, scadenze, domande e allegati. Sul tuo PC o su una cartella di rete condivisa con i colleghi: nessun server da installare.') }}
        </p>
        <div class="mt-8 flex flex-wrap gap-2">
          <BaseButton variant="primary" @click="showCreate = true"><Plus :size="16" /> {{ t('Crea workspace') }}</BaseButton>
          <BaseButton @click="browse"><FolderOpen :size="16" /> {{ t('Apri cartella') }}</BaseButton>
          <BaseButton variant="ghost" :disabled="demoBusy" :title="t('Apre un workspace locale con dati inventati, per provare l\'app')" @click="tryDemo"><Sparkles :size="16" /> {{ t('Prova con dati di esempio') }}</BaseButton>
        </div>
        <p v-if="error" class="mt-3 text-[13px] text-danger">{{ error }}</p>
      </div>
      <div class="flex items-center justify-between text-[12.5px] text-ink-3">
        <span>{{ t('{user} su {host}', { user: session.identity.username, host: session.identity.hostname }) }}</span>
        <button class="rounded-md p-1.5 hover:bg-surface-2 hover:text-ink" :title="ui.isDark ? 'Tema chiaro' : 'Tema scuro'" @click="ui.toggleTheme()">
          <Sun v-if="ui.isDark" :size="16" />
          <Moon v-else :size="16" />
        </button>
      </div>
    </section>

    <!-- Colonna destra: recenti, oppure guida rapida -->
    <section class="flex flex-col overflow-y-auto px-12 py-10">
      <template v-if="session.config.recent.length">
        <h2 class="text-[13px] font-semibold text-ink-2">{{ t('Workspace recenti') }}</h2>
        <ul class="mt-3 divide-y divide-line">
          <li v-for="r in session.config.recent" :key="r.path" class="group flex items-center gap-3 py-3">
            <component :is="r.mode === 'network' ? Network : HardDrive" :size="18" class="shrink-0 text-accent" />
            <button class="min-w-0 flex-1 text-left" :disabled="busyPath !== null" @click="openPath(r.path)">
              <span class="block truncate font-semibold group-hover:text-accent-ink">{{ r.name }}</span>
              <span class="block truncate font-mono text-[12px] text-ink-3">{{ r.path }}</span>
            </button>
            <span class="shrink-0 text-[12px] text-ink-3">{{ dayjs(r.lastOpened).fromNow() }}</span>
            <button
              class="shrink-0 rounded-md p-1 text-ink-3 opacity-0 hover:bg-surface-2 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
              :title="t('Rimuovi dai recenti')"
              @click="session.removeRecent(r.path)"
            >
              <X :size="14" />
            </button>
          </li>
        </ul>
      </template>
      <template v-else>
        <h2 class="text-[13px] font-semibold text-ink-2">{{ t('Primi passi') }}</h2>
        <p class="mt-1 text-[13.5px] text-ink-2">{{ t('Nessun workspace ancora. Ecco come funziona, in quattro punti.') }}</p>
        <ol class="mt-5 space-y-4">
          <li v-for="(s, i) in steps" :key="s.title" class="flex gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-ink">{{ i + 1 }}</span>
            <div>
              <p class="flex items-center gap-1.5 font-semibold"><component :is="s.icon" :size="14" class="text-accent" /> {{ s.title }}</p>
              <p class="text-[13px] leading-relaxed text-ink-2">{{ s.text }}</p>
            </div>
          </li>
        </ol>
        <div class="mt-6 flex gap-2">
          <BaseButton variant="soft" size="sm" :disabled="demoBusy" @click="tryDemo"><Sparkles :size="14" /> {{ t('Esplora un esempio') }}</BaseButton>
          <BaseButton variant="ghost" size="sm" @click="showCreate = true">{{ t('Crea il tuo workspace') }}</BaseButton>
        </div>
      </template>
    </section>

    <WorkspaceDialog v-model:open="showCreate" @opened="goIn" />
    <PasswordDialog v-model:open="showPassword" @unlocked="goIn" />
  </div>
</template>
