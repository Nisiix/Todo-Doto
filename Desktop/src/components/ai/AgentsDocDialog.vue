<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, Loader2, Save } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { withAi } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'
import { agentsDoc } from '@/services/aiAssist'
import { getFs } from '@/services/fs'
import { getLocalProjectPath, validateProjectFolder } from '@/services/projectFolder'
import { resolveStack, varsFor } from '@/services/scaffold'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Istruzioni per gli agenti',
    lead: 'Un file per gli agenti di programmazione (Claude Code, Codex, Copilot…), scritto a partire dallo Stack del progetto. Rileggilo e correggilo prima di salvarlo.',
    generate: 'Scrivi il file',
    writing: 'Scrivo il file dallo Stack…',
    failed: 'Non è stato possibile scrivere il file adesso. Controlla l’IA locale nelle Impostazioni.',
    save: (f: string) => `Salva ${f} nella cartella del progetto`,
    noFolder: 'La cartella del progetto non è raggiungibile da questo PC: copia il testo e salvalo a mano.',
    overwriteTitle: (f: string) => `Sostituire ${f}?`,
    overwriteMessage: (f: string) => `Nella cartella del progetto c’è già ${f}: verrà sostituito con questo testo.`,
    overwrite: 'Sostituisci',
    saved: (f: string) => `${f} salvato nella cartella del progetto`,
    copied: 'Testo copiato',
  },
  en: {
    title: 'Instructions for agents',
    lead: 'A file for coding agents (Claude Code, Codex, Copilot…), written from the project Stack. Read it through and fix it before saving.',
    generate: 'Write the file',
    writing: 'Writing the file from the Stack…',
    failed: 'Could not write the file right now. Check the local AI in Settings.',
    save: (f: string) => `Save ${f} in the project folder`,
    noFolder: 'The project folder cannot be reached from this PC: copy the text and save it by hand.',
    overwriteTitle: (f: string) => `Replace ${f}?`,
    overwriteMessage: (f: string) => `The project folder already has ${f}: it will be replaced with this text.`,
    overwrite: 'Replace',
    saved: (f: string) => `${f} saved in the project folder`,
    copied: 'Text copied',
  },
})

/**
 * AGENTS.md / CLAUDE.md scritto dall'IA locale a partire dallo Stack. Il testo
 * si rilegge e si modifica qui; nella cartella del progetto si scrive solo con
 * «Salva» (e, se il file c'è già, solo dopo conferma). Nient'altro viene toccato.
 */
const props = defineProps<{ project: Project }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

type FileName = 'AGENTS.md' | 'CLAUDE.md'
const fileName = ref<FileName>('AGENTS.md')
const text = ref('')
const busy = ref(false)
const failed = ref(false)
const folder = ref('')
const files = [
  { value: 'AGENTS.md' as FileName, label: 'AGENTS.md' },
  { value: 'CLAUDE.md' as FileName, label: 'CLAUDE.md' },
]

watch(open, async (o) => {
  if (!o) return
  text.value = ''
  failed.value = false
  const local = ws.meta ? getLocalProjectPath(ws.meta.id, props.project.id) : ''
  const path = local || resolveStack(props.project.stack, varsFor(props.project.name)).sourcePath.trim()
  folder.value = path && (await validateProjectFolder(path, props.project.name)).ok ? path : ''
})

async function generate() {
  busy.value = true
  failed.value = false
  const p = props.project
  const r = await withAi((cfg) =>
    agentsDoc(cfg, { projectName: p.name, description: p.description, stack: resolveStack(p.stack, varsFor(p.name)), tools: p.aiTools.map((t) => (t.notes ? `${t.name}: ${t.notes}` : t.name)), fileName: fileName.value }),
  )
  busy.value = false
  if (r) text.value = r
  else failed.value = true
}

const canSave = computed(() => !!folder.value && !!text.value.trim())
async function save() {
  const fs = await getFs()
  const target = await fs.join(folder.value, fileName.value)
  if ((await fs.exists(target)) && !(await confirm({ title: m.overwriteTitle(fileName.value), message: m.overwriteMessage(fileName.value), confirmLabel: m.overwrite, danger: true }))) return
  await fs.writeTextAtomic(target, text.value.trimEnd() + '\n')
  ui.toast(m.saved(fileName.value), 'success', undefined, 3000)
  open.value = false
}
async function copy() {
  try {
    await navigator.clipboard.writeText(text.value)
    ui.toast(m.copied, 'success', undefined, 1500)
  } catch {
    /* appunti non disponibili */
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.lead" width="xl">
    <div class="space-y-3" data-agents-doc>
      <div class="flex flex-wrap items-center gap-2">
        <SegmentedControl v-model="fileName" :options="files" />
        <BaseButton size="sm" :variant="text ? 'ghost' : 'primary'" :disabled="busy" data-agents-generate @click="generate">{{ m.generate }}</BaseButton>
      </div>
      <p v-if="busy" class="flex items-center gap-2 text-[13px] text-ink-2"><Loader2 :size="14" class="animate-spin" /> {{ m.writing }}</p>
      <p v-else-if="failed" class="text-[13px] text-danger">{{ m.failed }}</p>
      <textarea v-if="text" v-model="text" class="field min-h-[45vh] resize-y font-mono text-[12.5px] leading-relaxed" data-agents-text />
      <p v-if="text && !folder" class="text-[12.5px] text-ink-3">{{ m.noFolder }}</p>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.close }}</BaseButton>
      <BaseButton v-if="text" variant="ghost" @click="copy"><Copy :size="14" /> {{ common.actions.copy }}</BaseButton>
      <BaseButton v-if="text" variant="primary" :disabled="!canSave" data-agents-save @click="save"><Save :size="14" /> {{ m.save(fileName) }}</BaseButton>
    </template>
  </BaseDialog>
</template>
