<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getFs } from '@/services/fs'
import { useWorkspaceStore } from '@/stores/workspace'
import type { WorkspaceMode } from '@/types'
import { FolderOpen, HardDrive, Network } from 'lucide-vue-next'

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
  const p = await fs.pickFolder('Scegli la cartella del workspace')
  if (p) {
    path.value = p
    if (!name.value) name.value = p.split(/[\\/]/).filter(Boolean).pop() ?? ''
  }
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) return (error.value = t('Dai un nome al workspace.'))
  if (!path.value) return (error.value = t('Scegli una cartella.'))
  if (mode.value === 'network') {
    if (password.value.length < 6) return (error.value = t('La password deve avere almeno 6 caratteri.'))
    if (password.value !== password2.value) return (error.value = t('Le due password non coincidono.'))
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
  <BaseDialog v-model:open="open" :title="t('Nuovo workspace')" :description="t('Un workspace è una cartella che contiene categorie e progetti.')">
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="ws-name">{{ t('Nome') }}</label>
        <input id="ws-name" v-model="name" class="field" :placeholder="t('Es. Roadmap sviluppo')" data-autofocus />
      </div>
      <div>
        <label class="label">{{ t('Cartella') }}</label>
        <div class="flex gap-2">
          <input v-model="path" class="field font-mono text-[12.5px]" :placeholder="t('D:\\Roadmap oppure Z:\\Condivisa\\Roadmap')" />
          <BaseButton @click="pick"><FolderOpen :size="15" /> {{ t('Sfoglia') }}</BaseButton>
        </div>
      </div>
      <div>
        <span class="label">{{ t('Dove vivono i dati') }}</span>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors"
            :class="mode === 'local' ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2'"
            @click="mode = 'local'"
          >
            <HardDrive :size="18" class="mt-0.5 shrink-0 text-accent" />
            <span>
              <span class="block font-semibold">{{ t('Solo su questo PC') }}</span>
              <span class="block text-[12.5px] text-ink-2">{{ t('Nessuna password, sei tu l\'unico utente.') }}</span>
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
              <span class="block font-semibold">{{ t('Condiviso in rete') }}</span>
              <span class="block text-[12.5px] text-ink-2">{{ t('Cartella su server; i colleghi entrano con una password.') }}</span>
            </span>
          </button>
        </div>
      </div>
      <div v-if="mode === 'network'" class="grid grid-cols-2 gap-2">
        <div>
          <label class="label" for="ws-pw">{{ t('Password di accesso') }}</label>
          <input id="ws-pw" v-model="password" type="password" class="field" autocomplete="new-password" />
        </div>
        <div>
          <label class="label" for="ws-pw2">{{ t('Ripeti password') }}</label>
          <input id="ws-pw2" v-model="password2" type="password" class="field" autocomplete="new-password" />
        </div>
        <p class="col-span-2 text-[12.5px] text-ink-2">
          {{ t('Tu sarai amministratore. Chi apre la cartella da un altro PC dovrà inserire la password una sola volta.') }}
        </p>
      </div>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ t('Annulla') }}</BaseButton>
      <BaseButton variant="primary" :disabled="busy" @click="submit">{{ t('Crea workspace') }}</BaseButton>
    </template>
  </BaseDialog>
</template>
