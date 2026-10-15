<script setup lang="ts">
import { t, tn } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { FileUp, FolderOpen } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs, isTauri } from '@/services/fs'
import { importAny, summarize, type ImportResult } from '@/services/import'
import { PRIORITY_LABEL } from '@/types'

/**
 * Import di elementi da CSV (Excel, il nostro export, altri strumenti) o da
 * un'esportazione JSON di Trello, nel progetto aperto. Anteprima prima di scrivere.
 */
const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()

const result = ref<ImportResult | null>(null)
const fileName = ref('')
const error = ref('')
const busy = ref(false)
const pasted = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

watch(open, (o) => {
  if (o) {
    result.value = null
    fileName.value = ''
    error.value = ''
    pasted.value = ''
  }
})

function analyze(text: string, name: string | null) {
  error.value = ''
  const r = importAny(text, name)
  if (!r.items.length && !r.warnings.length) r.warnings.push('Nessun elemento trovato nel file.')
  result.value = r
}

async function pickFile() {
  if (isTauri) {
    const fs = await getFs()
    const p = await fs.pickFile('Scegli un file CSV o un’esportazione JSON di Trello')
    if (!p) return
    try {
      fileName.value = p.split(/[\\/]/).pop() ?? p
      analyze(await fs.readText(p), fileName.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  } else fileInput.value?.click()
}

async function onBrowserFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  fileName.value = f.name
  analyze(await f.text(), f.name)
}

function analyzePasted() {
  if (pasted.value.trim()) analyze(pasted.value, null)
}

const preview = computed(() => result.value?.items.slice(0, 6) ?? [])
const newLabels = computed(() => result.value?.labels.filter((l) => !ws.tree.labels.some((x) => x.name.toLowerCase() === l.name.toLowerCase())) ?? [])

async function doImport() {
  if (!result.value?.items.length) return
  busy.value = true
  const n = await ws.importItems(props.projectId, result.value.items, result.value.labels)
  busy.value = false
  if (n) {
    ui.toast(tn(n, '1 elemento importato', '{n} elementi importati'), 'success')
    open.value = false
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="t('Importa elementi')" :description="t('Da un file CSV (Excel, il nostro export) o dall’esportazione JSON di una bacheca Trello.')" width="lg">
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <BaseButton @click="pickFile"><FolderOpen :size="15" /> {{ t('Scegli file…') }}</BaseButton>
        <input ref="fileInput" type="file" accept=".csv,.txt,.json,text/csv,application/json" class="hidden" @change="onBrowserFile" />
        <span v-if="fileName" class="truncate font-mono text-[12px] text-ink-3">{{ fileName }}</span>
      </div>
      <details class="text-[13px]">
        <summary class="cursor-pointer text-ink-2">{{ t('Oppure incolla il testo (CSV o JSON)') }}</summary>
        <textarea v-model="pasted" class="field mt-2 min-h-24 resize-y font-mono text-[12px]" placeholder="Titolo;Priorità;Scadenza&#10;Login SPID;Alta;30/11/2026" spellcheck="false" @blur="analyzePasted" />
        <BaseButton size="sm" class="mt-2" :disabled="!pasted.trim()" @click="analyzePasted">{{ t('Analizza') }}</BaseButton>
      </details>
      <p class="text-[12px] text-ink-3">
        {{ t('CSV: colonne riconosciute Titolo, Descrizione, Priorità, Stato, Scadenza, Etichetta, Contenitore (anche in inglese; il separatore è rilevato da solo). Trello: Menu → Altro → Stampa ed esporta → Esporta come JSON; le liste «Done/Fatto» diventano Completati, le schede archiviate finiscono nel Cestino.') }}
      </p>
      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>

      <section v-if="result" class="rounded-md border border-line p-3 text-[13px]">
        <p class="font-semibold">
          {{ tn(result.items.length, '1 elemento', '{n} elementi') }}
          <span class="font-normal text-ink-2">· {{ result.source === 'trello' ? t('bacheca Trello') + (result.name ? ' «' + result.name + '»' : '') : 'CSV' }} · {{ summarize(result) }}</span>
        </p>
        <ul v-if="preview.length" class="mt-2 divide-y divide-line">
          <li v-for="(it, i) in preview" :key="i" class="flex items-center gap-2 py-1">
            <span class="h-4 w-1 rounded-full" :class="`bg-p-${it.priority}`" />
            <span class="min-w-0 flex-1 truncate">{{ it.title }}</span>
            <span class="text-[11.5px] text-ink-3">{{ t(PRIORITY_LABEL[it.priority]) }}{{ it.dueDate ? ' · ' + it.dueDate : '' }}{{ it.label ? ' · ' + it.label : '' }}</span>
          </li>
        </ul>
        <p v-if="result.items.length > preview.length" class="mt-1 text-[12px] text-ink-3">{{ t('… e altri {n}', { n: result.items.length - preview.length }) }}</p>
        <p v-if="newLabels.length" class="mt-2 text-[12px] text-ink-2">Etichette da creare: {{ newLabels.map((l) => l.name).join(', ') }}</p>
        <ul v-if="result.warnings.length" class="mt-2 list-disc pl-4 text-[12px] text-p-alta">
          <li v-for="(w, i) in result.warnings.slice(0, 5)" :key="i">{{ w }}</li>
        </ul>
      </section>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ t('Annulla') }}</BaseButton>
      <BaseButton variant="primary" :disabled="busy || !result?.items.length" @click="doImport"><FileUp :size="14" /> {{ t('Importa') }} {{ result?.items.length || '' }}</BaseButton>
    </template>
  </BaseDialog>
</template>
