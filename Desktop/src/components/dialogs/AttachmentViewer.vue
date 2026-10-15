<script setup lang="ts">
import { t } from '@/i18n'
import { onBeforeUnmount, ref, watch } from 'vue'
import { ExternalLink, FileWarning, Loader2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { getFs } from '@/services/fs'
import { previewFromBytes, type PreviewContent } from '@/services/preview'
import { useDriveStore } from '@/stores/drive'

/**
 * Visualizzatore interno: immagini, PDF e testo si aprono nell'app; le pagine
 * web in un riquadro incorporato; i file di Google Drive vengono scaricati
 * (o esportati in PDF se sono documenti Google). C'è sempre il pulsante per
 * aprire l'originale con l'app di sistema o nel browser.
 */
export interface ViewerTarget {
  kind: 'file' | 'link' | 'drive'
  name: string
  target: string // percorso, URL o id Drive
  mime?: string | null
  webViewLink?: string | null
}

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ item: ViewerTarget | null }>()
const drive = useDriveStore()

const loading = ref(false)
const error = ref('')
const content = ref<PreviewContent | null>(null)

function clear() {
  content.value?.revoke?.()
  content.value = null
  error.value = ''
}

async function load() {
  clear()
  const it = props.item
  if (!it) return
  if (it.kind === 'link') {
    content.value = { kind: 'web', url: it.target }
    return
  }
  loading.value = true
  try {
    if (it.kind === 'file') {
      const bytes = await (await getFs()).readBinary(it.target)
      content.value = previewFromBytes(it.name, bytes)
    } else {
      const { bytes, name, mime } = await drive.fetchForPreview(it.target)
      content.value = previewFromBytes(name, bytes, mime)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch([open, () => props.item], ([o]) => (o ? void load() : clear()), { immediate: true })
onBeforeUnmount(clear)

async function openOriginal() {
  const it = props.item
  if (!it) return
  const fs = await getFs()
  if (it.kind === 'file') await fs.openExternal(it.target, 'file')
  else if (it.kind === 'link') await fs.openExternal(it.target, 'link')
  else if (it.webViewLink) await fs.openExternal(it.webViewLink, 'link')
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="item?.name ?? ''" :description="item?.kind === 'drive' ? 'Google Drive' : item?.target" width="xl">
    <div class="relative h-[70vh] overflow-hidden rounded-md border border-line bg-surface-2">
      <div v-if="loading" class="flex h-full items-center justify-center gap-2 text-ink-2">
        <Loader2 :size="18" class="animate-spin" /> {{ t('Caricamento…') }}
      </div>
      <div v-else-if="error" class="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-ink-2">
        <FileWarning :size="28" class="text-danger" />
        <p class="font-semibold text-ink">{{ t('Non riesco a mostrare questo documento') }}</p>
        <p class="max-w-md text-[13px]">{{ error }}</p>
      </div>
      <template v-else-if="content">
        <img v-if="content.kind === 'image'" :src="content.url" :alt="item?.name" class="mx-auto h-full w-full object-contain" />
        <iframe v-else-if="content.kind === 'pdf'" :src="content.url" class="h-full w-full bg-white" :title="item?.name" />
        <pre v-else-if="content.kind === 'text'" class="h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-relaxed">{{ content.text }}</pre>
        <template v-else-if="content.kind === 'web'">
          <iframe :src="content.url" class="h-full w-full bg-white" :title="item?.name" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
          <p class="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink/80 px-3 py-1 text-[11.5px] text-white">
            {{ t('Alcuni siti non si lasciano incorporare: in quel caso usa «Apri nel browser».') }}
          </p>
        </template>
        <div v-else class="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-ink-2">
          <FileWarning :size="28" />
          <p class="font-semibold text-ink">{{ t('Anteprima non disponibile per questo tipo di file') }}</p>
          <p class="max-w-md text-[13px]">{{ t('Immagini, PDF e file di testo si vedono qui; per il resto apri il documento con l\'applicazione di sistema.') }}</p>
        </div>
      </template>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ t('Chiudi') }}</BaseButton>
      <BaseButton variant="primary" @click="openOriginal">
        <ExternalLink :size="14" />
        {{ item?.kind === 'file' ? 'Apri con l’app di sistema' : item?.kind === 'drive' ? 'Apri su Google Drive' : 'Apri nel browser' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
