<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getFs } from '@/services/fs'
import { useWorkspaceStore } from '@/stores/workspace'
import type { WorkspaceMode } from '@/types'
import { FolderOpen, HardDrive, Network } from 'lucide-vue-next'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    pickFolder: 'Scegli la cartella del workspace',
    errName: 'Dai un nome al workspace.',
    errFolder: 'Scegli una cartella.',
    title: 'Nuovo workspace',
    description: 'Un workspace è una cartella che contiene cartelle e progetti.',
    namePlaceholder: 'Es. Roadmap sviluppo',
    folder: 'Cartella',
    folderPlaceholder: 'D:\\Roadmap oppure Z:\\Condivisa\\Roadmap',
    where: 'Dove vivono i dati',
    local: 'Solo su questo PC',
    localHint: 'Nessuna password, sei tu l’unico utente.',
    network: 'Condiviso in rete',
    networkHint: 'Cartella su server; i colleghi entrano con una password.',
    password: 'Password di accesso',
    repeatPassword: 'Ripeti password',
    adminHint: 'Tu sarai amministratore. Chi apre la cartella da un altro PC dovrà inserire la password una sola volta.',
    create: 'Crea workspace',
  },
  en: {
    pickFolder: 'Choose the workspace folder',
    errName: 'Give the workspace a name.',
    errFolder: 'Choose a folder.',
    title: 'New workspace',
    description: 'A workspace is a folder that contains folders and projects.',
    namePlaceholder: 'E.g. Development roadmap',
    folder: 'Folder',
    folderPlaceholder: 'D:\\Roadmap or Z:\\Shared\\Roadmap',
    where: 'Where the data lives',
    local: 'Only on this PC',
    localHint: 'No password, you are the only user.',
    network: 'Shared on the network',
    networkHint: 'Folder on a server; colleagues join with a password.',
    password: 'Access password',
    repeatPassword: 'Repeat password',
    adminHint: 'You will be the administrator. Whoever opens the folder from another PC enters the password only once.',
    create: 'Create workspace',
  },
})

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ opened: []; needsPassword: [] }>()
const ws = useWorkspaceStore()

const name = ref('')
const path = ref('')
const mode = ref<WorkspaceMode>('local')
const password = ref('')
const password2 = ref('')
const error = ref('')
const busy = ref(false)

watch(open, (o) => {
  if (o) {
    name.value = ''
    path.value = ''
    mode.value = 'local'
    password.value = ''
    password2.value = ''
    error.value = ''
  }
})

async function pick() {
  const fs = await getFs()
  const p = await fs.pickFolder(m.pickFolder)
  if (p) {
    path.value = p
    if (!name.value) name.value = p.split(/[\\/]/).filter(Boolean).pop() ?? ''
  }
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) return (error.value = m.errName)
  if (!path.value) return (error.value = m.errFolder)
  if (mode.value === 'network') {
    if (password.value.length < 6) return (error.value = common.password.tooShort)
    if (password.value !== password2.value) return (error.value = common.password.mismatch)
  }
  busy.value = true
  const r = await ws.create({ path: path.value, name: name.value, mode: mode.value, password: password.value })
  busy.value = false
  if (r.ok) {
    open.value = false
    emit('opened')
  } else if ('error' in r) error.value = r.error
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description">
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="ws-name">{{ common.name }}</label>
        <input id="ws-name" v-model="name" class="field" :placeholder="m.namePlaceholder" data-autofocus />
      </div>
      <div>
        <label class="label">{{ m.folder }}</label>
        <div class="flex gap-2">
          <input v-model="path" class="field font-mono text-[12.5px]" :placeholder="m.folderPlaceholder" />
          <BaseButton @click="pick"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
      </div>
      <div>
        <span class="label">{{ m.where }}</span>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors"
            :class="mode === 'local' ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2'"
            @click="mode = 'local'"
          >
            <HardDrive :size="18" class="mt-0.5 shrink-0 text-accent" />
            <span>
              <span class="block font-semibold">{{ m.local }}</span>
              <span class="block text-[12.5px] text-ink-2">{{ m.localHint }}</span>
            </span>
          </button>
          <button
            type="button"
            class="flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors"
            :class="mode === 'network' ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2'"
            @click="mode = 'network'"
          >
            <Network :size="18" class="mt-0.5 shrink-0 text-accent" />
            <span>
              <span class="block font-semibold">{{ m.network }}</span>
              <span class="block text-[12.5px] text-ink-2">{{ m.networkHint }}</span>
            </span>
          </button>
        </div>
      </div>
      <div v-if="mode === 'network'" class="grid grid-cols-2 gap-2">
        <div>
          <label class="label" for="ws-pw">{{ m.password }}</label>
          <input id="ws-pw" v-model="password" type="password" class="field" autocomplete="new-password" />
        </div>
        <div>
          <label class="label" for="ws-pw2">{{ m.repeatPassword }}</label>
          <input id="ws-pw2" v-model="password2" type="password" class="field" autocomplete="new-password" />
        </div>
        <p class="col-span-2 text-[12.5px] text-ink-2">
          {{ m.adminHint }}
        </p>
      </div>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="busy" @click="submit">{{ m.create }}</BaseButton>
    </template>
  </BaseDialog>
</template>
