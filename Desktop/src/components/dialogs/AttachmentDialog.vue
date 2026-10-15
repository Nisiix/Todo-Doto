<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { FolderOpen } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { getFs } from '@/services/fs'
import { useWorkspaceStore } from '@/stores/workspace'
import { useDriveStore } from '@/stores/drive'
import type { Attachment, Project } from '@/types'

const props = defineProps<{ project: Project; attachment?: Attachment | null; defaultFolderId?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const drive = useDriveStore()

type Kind = Attachment['kind']
const kind = ref<Kind>('link')
const name = ref('')
const target = ref('')
const folderId = ref<string | null>(null)
const error = ref('')
const driveSearch = ref('')

const kinds = computed(() => [
  { value: 'link' as Kind, label: t('Link') },
  { value: 'file' as Kind, label: t('File') },
  ...(drive.rootFolderId ? [{ value: 'drive' as Kind, label: t('Google Drive') }] : []),
])
const driveFiles = computed(() => {
  const q = driveSearch.value.trim().toLowerCase()
  return drive.files.filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 50)
})

watch(open, (o) => {
  if (!o) return
  const a = props.attachment
  kind.value = a?.kind ?? 'link'
  name.value = a?.name ?? ''
  target.value = a?.target ?? ''
  folderId.value = a?.folderId ?? props.defaultFolderId ?? null
  error.value = ''
  driveSearch.value = ''
})

async function pickFile() {
  const fs = await getFs()
  const p = await fs.pickFile('Scegli il file da collegare')
  if (p) {
    target.value = p
    if (!name.value) name.value = p.split(/[\\/]/).pop() ?? ''
  }
}
function pickDrive(id: string) {
  target.value = id
  name.value = drive.nodesById[id]?.name ?? name.value
}

function guessName() {
  if (name.value || !target.value) return
  if (kind.value === 'link') {
    try {
      name.value = new URL(target.value).hostname.replace(/^www\./, '')
    } catch {
      /* lascia vuoto */
    }
  } else if (kind.value === 'file') name.value = target.value.split(/[\\/]/).pop() ?? ''
}

async function submit() {
  guessName()
  if (!target.value.trim()) return (error.value = kind.value === 'link' ? t('Inserisci un indirizzo.') : kind.value === 'file' ? t('Scegli un file.') : t('Scegli un file di Drive.'))
  if (kind.value === 'link' && !/^https?:\/\//i.test(target.value.trim())) target.value = `https://${target.value.trim()}`
  if (!name.value.trim()) return (error.value = t('Dai un nome all’allegato.'))
  const data = { kind: kind.value, name: name.value, target: target.value.trim(), folderId: folderId.value }
  if (props.attachment) await ws.updateAttachment(props.project.id, props.attachment.id, data)
  else await ws.addAttachment(props.project.id, data)
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="attachment ? 'Modifica allegato' : 'Nuovo allegato'" :description="t('Un file sul PC o in rete, un indirizzo web, oppure un documento della cartella Drive sincronizzata.')">
    <form class="space-y-4" @submit.prevent="submit">
      <SegmentedControl v-model="kind" :options="kinds" />

      <div v-if="kind === 'drive'">
        <label class="label" for="a-drive-search">{{ t('File su Google Drive') }}</label>
        <input id="a-drive-search" v-model="driveSearch" class="field field-sm" :placeholder="t('Cerca per nome nella cartella sincronizzata')" data-autofocus />
        <ul class="mt-1 max-h-44 divide-y divide-line overflow-y-auto rounded-md border border-line">
          <li v-for="f in driveFiles" :key="f.id">
            <button type="button" class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] hover:bg-surface-2" :class="{ 'bg-accent-soft text-accent-ink': target === f.id }" @click="pickDrive(f.id)">
              <span class="min-w-0 flex-1 truncate">{{ f.name }}</span>
              <span class="truncate text-[11px] text-ink-3">{{ drive.pathOf(f.id) }}</span>
            </button>
          </li>
          <li v-if="!driveFiles.length" class="px-2 py-2 text-[12.5px] text-ink-3">{{ t('Nessun file: sincronizza la cartella dalla pagina Drive.') }}</li>
        </ul>
      </div>
      <div v-else>
        <label class="label" for="a-target">{{ kind === 'link' ? 'Indirizzo' : 'Percorso' }}</label>
        <div class="flex gap-2">
          <input id="a-target" v-model="target" class="field font-mono text-[12.5px]" :placeholder="kind === 'link' ? 'https://…' : 'Z:\\Documenti\\analisi.pdf'" data-autofocus @blur="guessName" />
          <BaseButton v-if="kind === 'file'" @click="pickFile"><FolderOpen :size="15" /> {{ t('Sfoglia') }}</BaseButton>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="a-name">{{ t('Nome') }}</label>
          <input id="a-name" v-model="name" class="field" :placeholder="t('Come lo vedrai in lista')" />
        </div>
        <div>
          <label class="label" for="a-folder">{{ t('Cartella') }}</label>
          <select id="a-folder" v-model="folderId" class="field">
            <option :value="null">{{ t('Senza cartella') }}</option>
            <option v-for="f in project.attachmentFolders" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
      </div>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ t('Annulla') }}</BaseButton>
      <BaseButton variant="primary" @click="submit">{{ attachment ? 'Salva' : 'Aggiungi' }}</BaseButton>
    </template>
  </BaseDialog>
</template>
