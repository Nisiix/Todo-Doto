<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ChevronRight, Cloud, ExternalLink, FileText, Folder, FolderOpen, Image, Link2Off, Loader2, RefreshCw, Sheet, Presentation, Search, Unplug } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import UpgradeNotice from '@/components/ui/UpgradeNotice.vue'
import AttachmentViewer, { type ViewerTarget } from '@/components/dialogs/AttachmentViewer.vue'
import { useDriveStore } from '@/stores/drive'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'
import { getFs, isTauri } from '@/services/fs'
import { formatBytes } from '@/services/preview'
import type { DriveNode } from '@/types'

const drive = useDriveStore()
const ws = useWorkspaceStore()
const confirm = useConfirm()

onMounted(() => void drive.init())

// --- configurazione --------------------------------------------------------
const clientId = ref('')
const clientSecret = ref('')
const folderLink = ref('')
const busy = ref(false)
const formError = ref('')

async function saveClient() {
  if (!clientId.value.trim()) return (formError.value = t('Inserisci l’ID client OAuth.'))
  formError.value = ''
  await drive.configure(clientId.value, clientSecret.value)
  await drive.connect()
}
async function chooseFolder() {
  busy.value = true
  formError.value = ''
  try {
    await drive.setRootFolder(folderLink.value)
    folderLink.value = ''
  } catch (e) {
    formError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function disconnect() {
  if (await confirm({ title: t('Scollegare l’account Google?'), message: t('La struttura già sincronizzata resta visibile; per aprire i documenti servirà ricollegarsi.'), confirmLabel: t('Scollega') }))
    await drive.disconnect()
}
async function forgetFolder() {
  if (await confirm({ title: t('Rimuovere la cartella sincronizzata?'), message: t('Viene tolta solo la copia della struttura nel workspace: su Google Drive non cambia nulla.'), confirmLabel: t('Rimuovi'), danger: true }))
    await drive.clearRootFolder()
}

// --- navigazione -----------------------------------------------------------
const currentFolder = ref<string | null>(null)
const search = ref('')
const breadcrumb = computed(() => {
  const parts: DriveNode[] = []
  let cur = currentFolder.value ? drive.nodesById[currentFolder.value] : undefined
  while (cur) {
    parts.unshift(cur)
    cur = cur.parentId ? drive.nodesById[cur.parentId] : undefined
  }
  return parts
})
const entries = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (q) return drive.nodes.filter((n) => n.name.toLowerCase().includes(q))
  return drive.childrenOf(currentFolder.value)
})
const expanded = ref(new Set<string>())
function toggle(id: string) {
  expanded.value.has(id) ? expanded.value.delete(id) : expanded.value.add(id)
  expanded.value = new Set(expanded.value)
}
/** Albero piatto delle sole cartelle, con profondità, per la colonna sinistra. */
const folderTree = computed(() => {
  const out: { node: DriveNode; depth: number; hasChildren: boolean }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const n of drive.childrenOf(parentId).filter(drive.isFolder)) {
      const kids = drive.childrenOf(n.id).some(drive.isFolder)
      out.push({ node: n, depth, hasChildren: kids })
      if (expanded.value.has(n.id)) walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const iconFor = (n: DriveNode) => {
  if (drive.isFolder(n)) return Folder
  if (n.mimeType.startsWith('image/')) return Image
  if (n.mimeType.includes('spreadsheet')) return Sheet
  if (n.mimeType.includes('presentation')) return Presentation
  return FileText
}

// --- anteprima ---------------------------------------------------------------
const viewerOpen = ref(false)
const viewerItem = ref<ViewerTarget | null>(null)
function open(n: DriveNode) {
  if (drive.isFolder(n)) {
    currentFolder.value = n.id
    search.value = ''
    return
  }
  viewerItem.value = { kind: 'drive', name: n.name, target: n.id, mime: n.mimeType, webViewLink: n.webViewLink }
  viewerOpen.value = true
}
const openOnDrive = async (n: DriveNode) => n.webViewLink && (await getFs()).openExternal(n.webViewLink, 'link')
</script>

<template>
  <div v-if="!ws.can('drive')" class="w-full overflow-y-auto px-10 py-8">
    <h1 class="flex items-center gap-2 text-[24px] font-extrabold leading-tight tracking-tight"><Cloud :size="22" class="text-accent" /> {{ t('Google Drive') }}</h1>
    <p class="mt-1 max-w-xl text-[13.5px] text-ink-2">{{ t('Replica la struttura di una cartella di Drive nel workspace e apri i documenti direttamente qui, ognuno con il proprio account Google.') }}</p>
    <UpgradeNotice feature="drive" class="mt-6" />
  </div>
  <div v-else class="flex min-w-0 flex-1 flex-col">
    <header class="shrink-0 border-b border-line px-8 pb-4 pt-6">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="flex items-center gap-2 text-[24px] font-extrabold leading-tight tracking-tight"><Cloud :size="22" class="text-accent" /> {{ t('Google Drive') }}</h1>
          <p class="mt-1 text-[13.5px] text-ink-2">
            <template v-if="drive.rootFolderId">
              {{ t('Cartella «{name}» · {n} elementi', { name: drive.rootName, n: drive.nodes.length }) }}
              <template v-if="drive.syncedAt"> · {{ t('sincronizzata {when} da {who}', { when: dayjs(drive.syncedAt).fromNow(), who: ws.userName(ws.drive.syncedBy) }) }}</template>
            </template>
            <template v-else>{{ t('Replica la struttura di una cartella di Drive nel workspace e apri i documenti direttamente qui.') }}</template>
          </p>
        </div>
        <div class="flex items-center gap-1.5">
          <span v-if="drive.account" class="mr-1 text-[12.5px] text-ink-3" :title="drive.account.name">{{ drive.account.email }}</span>
          <BaseButton v-if="drive.rootFolderId && drive.status === 'connected'" size="sm" :disabled="drive.syncing" @click="drive.sync()">
            <Loader2 v-if="drive.syncing" :size="14" class="animate-spin" /><RefreshCw v-else :size="14" />
            {{ drive.syncing ? t('Sincronizzo… {n}', { n: drive.syncProgress }) : t('Sincronizza') }}
          </BaseButton>
          <BaseButton v-if="drive.status === 'connected'" size="sm" variant="ghost" :title="t('Scollega account Google')" @click="disconnect"><Unplug :size="14" /></BaseButton>
          <BaseButton v-else-if="drive.status === 'disconnected'" size="sm" variant="primary" @click="drive.connect()">{{ t('Collega account Google') }}</BaseButton>
        </div>
      </div>
      <p v-if="drive.error" class="mt-2 text-[13px] text-danger">{{ drive.error }}</p>
    </header>

    <!-- Configurazione -->
    <div v-if="!isTauri" class="m-8 max-w-xl rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2">
      {{ t('Il collegamento a Google Drive è disponibile nell’app desktop (richiede il browser di sistema per l’accesso).') }}
    </div>
    <div v-else-if="drive.status === 'unconfigured'" class="m-8 max-w-xl space-y-4">
      <div class="rounded-lg border border-line bg-surface p-5">
        <h2 class="text-[15px] font-bold">{{ t('1. Crea un ID client OAuth (una volta sola)') }}</h2>
        <ol class="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] text-ink-2">
          <li>{{ t('Vai su') }} <span class="font-mono">{{ t('console.cloud.google.com') }}</span> {{ t('→ API e servizi → Credenziali.') }}</li>
          <li>{{ t('Abilita l’API «Google Drive API» per il progetto.') }}</li>
          <li>{{ t('Crea credenziali → ID client OAuth → tipo') }} <b>{{ t('App desktop') }}</b>.</li>
          <li>{{ t('Copia qui l’ID client (e il segreto, se mostrato). Restano cifrati solo su questo PC.') }}</li>
        </ol>
        <p class="mt-2 text-[12.5px] text-ink-3">{{ t('L’app chiede solo il permesso di') }} <b>{{ t('lettura') }}</b> {{ t('di Drive e non salva mai il tuo account nella cartella condivisa.') }}</p>
      </div>
      <form class="space-y-3" @submit.prevent="saveClient">
        <div>
          <label class="label" for="d-cid">{{ t('ID client') }}</label>
          <input id="d-cid" v-model="clientId" class="field font-mono text-[12.5px]" :placeholder="t('123456-abc.apps.googleusercontent.com')" />
        </div>
        <div>
          <label class="label" for="d-sec">{{ t('Segreto client (facoltativo)') }}</label>
          <input id="d-sec" v-model="clientSecret" type="password" class="field font-mono text-[12.5px]" autocomplete="off" />
        </div>
        <p v-if="formError" class="text-[13px] text-danger">{{ formError }}</p>
        <BaseButton type="submit" variant="primary">{{ t('2. Salva e collega l’account Google') }}</BaseButton>
      </form>
    </div>
    <div v-else-if="drive.status !== 'connected' && !drive.rootFolderId" class="m-8 max-w-xl rounded-lg border border-line bg-surface p-5 text-[13.5px] text-ink-2">
      <p>{{ t('Client configurato. Collega l’account Google per scegliere la cartella da sincronizzare.') }}</p>
      <BaseButton class="mt-3" variant="primary" :disabled="drive.status === 'connecting'" @click="drive.connect()">
        <Loader2 v-if="drive.status === 'connecting'" :size="14" class="animate-spin" /> {{ t('Collega account Google') }}
      </BaseButton>
    </div>
    <div v-else-if="!drive.rootFolderId" class="m-8 max-w-xl space-y-3">
      <h2 class="text-[15px] font-bold">{{ t('Scegli la cartella da replicare') }}</h2>
      <p class="text-[13.5px] text-ink-2">{{ t('Incolla il link della cartella (da Drive: tasto destro → Condividi → Copia link) oppure il suo id. La struttura viene salvata nel workspace e la vedono tutti i membri; per aprire i documenti ognuno usa il proprio account.') }}</p>
      <form class="flex gap-2" @submit.prevent="chooseFolder">
        <input v-model="folderLink" class="field font-mono text-[12.5px]" :placeholder="t('https://drive.google.com/drive/folders/…')" />
        <BaseButton type="submit" variant="primary" :disabled="busy || !folderLink.trim()"><Loader2 v-if="busy" :size="14" class="animate-spin" /> {{ t('Sincronizza') }}</BaseButton>
      </form>
      <p v-if="formError" class="text-[13px] text-danger">{{ formError }}</p>
    </div>

    <!-- Esplorazione -->
    <div v-else class="flex min-h-0 flex-1">
      <aside class="w-64 shrink-0 overflow-y-auto border-r border-line px-2 py-3">
        <button class="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold hover:bg-surface-2" :class="{ 'bg-accent-soft text-accent-ink': currentFolder === null && !search }" @click="currentFolder = null; search = ''">
          <FolderOpen :size="14" class="shrink-0 text-accent" /> <span class="truncate">{{ drive.rootName }}</span>
        </button>
        <ul>
          <li v-for="f in folderTree" :key="f.node.id">
            <div class="flex h-7 items-center rounded-md text-[13px] hover:bg-surface-2" :class="{ 'bg-accent-soft text-accent-ink': currentFolder === f.node.id && !search }" :style="{ paddingLeft: `${8 + f.depth * 12}px` }">
              <button class="w-4 shrink-0 text-ink-3" :class="{ invisible: !f.hasChildren }" :aria-label="expanded.has(f.node.id) ? 'Chiudi' : 'Apri'" @click="toggle(f.node.id)">
                <ChevronRight :size="12" class="transition-transform" :class="{ 'rotate-90': expanded.has(f.node.id) }" />
              </button>
              <button class="flex min-w-0 flex-1 items-center gap-1.5 pr-2 text-left" @click="currentFolder = f.node.id; search = ''">
                <Folder :size="14" class="shrink-0 text-ink-3" /> <span class="truncate">{{ f.node.name }}</span>
              </button>
            </div>
          </li>
        </ul>
        <button class="mt-4 flex items-center gap-1.5 px-2 text-[12px] text-ink-3 hover:text-danger" @click="forgetFolder"><Link2Off :size="12" /> {{ t('Rimuovi cartella sincronizzata') }}</button>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex items-center gap-3 border-b border-line px-6 py-2">
          <nav class="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-ink-2">
            <button class="hover:text-ink" @click="currentFolder = null; search = ''">{{ drive.rootName }}</button>
            <template v-for="b in breadcrumb" :key="b.id">
              <ChevronRight :size="12" class="shrink-0 text-ink-3" />
              <button class="truncate hover:text-ink" @click="currentFolder = b.id; search = ''">{{ b.name }}</button>
            </template>
          </nav>
          <div class="relative w-64">
            <Search :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input v-model="search" class="field field-sm h-8 pl-8" :placeholder="t('Cerca in tutta la cartella')" />
          </div>
        </div>
        <ul class="flex-1 divide-y divide-line overflow-y-auto px-6">
          <li v-for="n in entries" :key="n.id" class="group flex h-10 items-center gap-3 hover:bg-surface-2">
            <component :is="iconFor(n)" :size="16" class="ml-1 shrink-0" :class="drive.isFolder(n) ? 'text-accent' : 'text-ink-3'" />
            <button class="min-w-0 flex-1 text-left" @click="open(n)">
              <span class="block truncate text-[13.5px] font-medium hover:text-accent-ink">{{ n.name }}</span>
              <span v-if="search" class="block truncate text-[11px] text-ink-3">{{ drive.pathOf(n.id) }}</span>
            </button>
            <span class="w-20 shrink-0 text-right text-[11.5px] tabular-nums text-ink-3">{{ n.size !== null ? formatBytes(n.size) : '' }}</span>
            <span class="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-ink-3">{{ n.modifiedTime ? dayjs(n.modifiedTime).format('D MMM YYYY') : '' }}</span>
            <button class="shrink-0 rounded-md p-1 text-ink-3 opacity-0 hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100" :title="t('Apri su Google Drive')" @click="openOnDrive(n)"><ExternalLink :size="14" /></button>
          </li>
          <li v-if="!entries.length" class="py-6 text-[13px] text-ink-3">{{ search ? 'Nessun elemento corrisponde.' : 'Cartella vuota.' }}</li>
        </ul>
      </div>
    </div>

    <AttachmentViewer v-model:open="viewerOpen" :item="viewerItem" />
  </div>
</template>
