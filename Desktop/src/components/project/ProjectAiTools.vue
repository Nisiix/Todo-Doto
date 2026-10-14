<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Copy, Download, ExternalLink, Eye, FileText, Paperclip, Pencil, Plug, Plus, Puzzle, Sparkles, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { getFs } from '@/services/fs'
import { AI_TOOL_KINDS, AI_TOOL_LABEL, type AiTool, type AiToolKind, type Project } from '@/types'

/**
 * Sezione "Strumenti AI": connettori, plugin e skill usati nel progetto.
 * Le skill possono essere allegate come file (es. SKILL.md): il contenuto
 * resta nel workspace e si può vedere, copiare o salvare.
 */
const props = defineProps<{ project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()

const canEdit = computed(() => ws.isAdmin && !props.readOnly)
const ICON: Record<AiToolKind, unknown> = { connector: Plug, plugin: Puzzle, skill: Sparkles }
const groups = computed(() => AI_TOOL_KINDS.map((k) => ({ kind: k, items: props.project.aiTools.filter((t) => t.kind === k) })))

// --- dialog aggiunta/modifica -------------------------------------------------
const open = ref(false)
const editing = ref<AiTool | null>(null)
const kind = ref<AiToolKind>('connector')
const name = ref('')
const url = ref('')
const notes = ref('')
const fileName = ref<string | null>(null)
const content = ref<string | null>(null)
const error = ref('')

function startAdd(k: AiToolKind) {
  editing.value = null
  kind.value = k
  name.value = url.value = notes.value = error.value = ''
  fileName.value = content.value = null
  open.value = true
}
function startEdit(t: AiTool) {
  editing.value = t
  kind.value = t.kind
  name.value = t.name
  url.value = t.url
  notes.value = t.notes
  fileName.value = t.fileName
  content.value = t.content
  error.value = ''
  open.value = true
}
watch(kind, (k) => {
  if (k !== 'skill') {
    fileName.value = null
    content.value = null
  }
})
async function attachSkill() {
  const fs = await getFs()
  const p = await fs.pickFile('Allega la skill (es. SKILL.md)')
  if (!p) return
  try {
    const bytes = await fs.readBinary(p)
    if (bytes.byteLength > 512 * 1024) return (error.value = 'Il file supera 512 KB: allega solo la definizione della skill.')
    content.value = new TextDecoder().decode(bytes)
    fileName.value = p.split(/[\\/]/).pop() ?? 'SKILL.md'
    if (!name.value) {
      const m = /^name:\s*(.+)$/m.exec(content.value)
      name.value = m ? m[1]!.trim() : fileName.value.replace(/\.md$/i, '')
    }
    error.value = ''
  } catch (e) {
    error.value = `Non riesco a leggere il file: ${e instanceof Error ? e.message : e}`
  }
}
async function submit() {
  if (!name.value.trim()) return (error.value = 'Dai un nome allo strumento.')
  const data = { kind: kind.value, name: name.value.trim(), url: url.value.trim(), notes: notes.value.trim(), fileName: fileName.value, content: content.value }
  if (editing.value) await ws.updateAiTool(props.project.id, editing.value.id, data)
  else await ws.addAiTool(props.project.id, data)
  open.value = false
}
async function remove(t: AiTool) {
  if (await confirm({ title: `Rimuovere «${t.name}»?`, message: t.content ? 'Verrà rimossa anche la skill allegata.' : '', confirmLabel: 'Rimuovi', danger: true }))
    await ws.removeAiTool(props.project.id, t.id)
}

// --- visualizzazione skill ---------------------------------------------------
const viewing = ref<AiTool | null>(null)
const viewOpen = ref(false)
function view(t: AiTool) {
  viewing.value = t
  viewOpen.value = true
}
async function copyContent(t: AiTool) {
  try {
    await navigator.clipboard.writeText(t.content ?? '')
    ui.toast('Contenuto copiato', 'success', undefined, 1500)
  } catch {
    ui.toast('Copia non riuscita', 'warning')
  }
}
async function saveContent(t: AiTool) {
  const fs = await getFs()
  const path = await fs.saveFile(t.fileName ?? `${t.name}.md`, 'Salva la skill')
  if (!path) return
  await fs.writeTextAtomic(path, t.content ?? '')
  ui.toast('Skill salvata', 'success', undefined, 1800)
}
const openUrl = async (u: string) => (await getFs()).openExternal(u, 'link')

const menu = (t: AiTool) => [
  ...(t.url ? [{ label: 'Apri link', icon: ExternalLink, onSelect: () => openUrl(t.url) }] : []),
  ...(t.content ? [{ label: 'Vedi skill', icon: Eye, onSelect: () => view(t) }, { label: 'Copia contenuto', icon: Copy, onSelect: () => copyContent(t) }, { label: 'Salva file…', icon: Download, onSelect: () => saveContent(t) }] : []),
  ...(canEdit.value ? [{ sep: true, label: '' }, { label: 'Modifica', icon: Pencil, onSelect: () => startEdit(t) }, { label: 'Rimuovi', icon: Trash2, danger: true, onSelect: () => remove(t) }] : []),
]
</script>

<template>
  <div class="max-w-4xl space-y-8">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-[17px] font-bold tracking-tight">Strumenti AI</h2>
        <p class="mt-0.5 text-[13px] text-ink-2">Connettori, plugin e skill usati per lavorare a questo progetto, con le skill allegate pronte da riusare.</p>
      </div>
      <BaseMenu v-if="canEdit" :items="AI_TOOL_KINDS.map((k) => ({ label: AI_TOOL_LABEL[k], icon: ICON[k] as never, onSelect: () => startAdd(k) }))">
        <BaseButton size="sm" variant="primary"><Plus :size="14" /> Aggiungi</BaseButton>
      </BaseMenu>
    </div>

    <section v-for="g in groups" :key="g.kind">
      <h3 class="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        <component :is="ICON[g.kind]" :size="14" class="text-accent" /> {{ AI_TOOL_LABEL[g.kind] }}
        <span class="tabular-nums text-ink-3">{{ g.items.length || '' }}</span>
      </h3>
      <ul v-if="g.items.length" class="divide-y divide-line">
        <li v-for="t in g.items" :key="t.id" class="group flex items-center gap-3 py-2 pr-1 hover:bg-surface-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-[13.5px] font-semibold">
              {{ t.name }}
              <button v-if="t.content" class="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-px text-[11px] font-semibold text-accent-ink hover:underline" :title="`Vedi ${t.fileName}`" @click="view(t)"><Paperclip :size="10" /> {{ t.fileName }}</button>
            </div>
            <p v-if="t.notes" class="text-[12.5px] text-ink-2">{{ t.notes }}</p>
            <button v-if="t.url" class="truncate font-mono text-[11.5px] text-accent-ink hover:underline" @click="openUrl(t.url)">{{ t.url }}</button>
          </div>
          <span class="shrink-0 text-[11.5px] text-ink-3">{{ ws.userName(t.addedBy) }} · {{ t.addedAt ? dayjs(t.addedAt).format('D MMM') : '' }}</span>
          <BaseMenu v-if="menu(t).length" :items="menu(t)">
            <MenuTriggerButton />
          </BaseMenu>
        </li>
      </ul>
      <p v-else class="text-[12.5px] text-ink-3">
        <template v-if="g.kind === 'connector'">Nessun connettore (es. GitHub, Google Drive, Supabase, Figma).</template>
        <template v-else-if="g.kind === 'plugin'">Nessun plugin.</template>
        <template v-else>Nessuna skill. Allega i file SKILL.md usati per questo progetto.</template>
      </p>
    </section>

    <!-- Dialog -->
    <BaseDialog v-model:open="open" :title="editing ? 'Modifica strumento' : 'Nuovo strumento AI'">
      <form class="space-y-4" @submit.prevent="submit">
        <SegmentedControl v-model="kind" :options="AI_TOOL_KINDS.map((k) => ({ value: k, label: AI_TOOL_LABEL[k] }))" />
        <div>
          <label class="label" for="ai-name">Nome</label>
          <input id="ai-name" v-model="name" class="field" :placeholder="kind === 'skill' ? 'Es. frontend-design' : kind === 'plugin' ? 'Es. Claude Code – plugin xlsx' : 'Es. GitHub, Supabase, Figma'" data-autofocus />
        </div>
        <div v-if="kind === 'skill'">
          <span class="label">File della skill</span>
          <div class="flex items-center gap-2">
            <BaseButton @click="attachSkill"><Paperclip :size="14" /> {{ fileName ? 'Sostituisci file' : 'Allega SKILL.md' }}</BaseButton>
            <span v-if="fileName" class="text-[12.5px] text-ink-2"><FileText :size="12" class="mr-1 inline" />{{ fileName }} · {{ (content?.length ?? 0).toLocaleString('it-IT') }} caratteri</span>
          </div>
          <textarea v-model="content" class="field mt-2 min-h-28 resize-y font-mono text-[12px]" placeholder="…oppure incolla qui il contenuto della skill" @input="fileName = fileName ?? 'SKILL.md'" />
        </div>
        <div>
          <label class="label" for="ai-url">Link (facoltativo)</label>
          <input id="ai-url" v-model="url" class="field font-mono text-[12.5px]" placeholder="https://…" />
        </div>
        <div>
          <label class="label" for="ai-notes">Come viene usato</label>
          <textarea id="ai-notes" v-model="notes" class="field min-h-16 resize-y" placeholder="Es. genera i file Excel di export; usato per la UI del modulo X…" />
        </div>
        <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
      </form>
      <template #footer>
        <BaseButton variant="ghost" @click="open = false">Annulla</BaseButton>
        <BaseButton variant="primary" @click="submit">{{ editing ? 'Salva' : 'Aggiungi' }}</BaseButton>
      </template>
    </BaseDialog>

    <BaseDialog v-model:open="viewOpen" :title="viewing?.name ?? ''" :description="viewing?.fileName ?? ''" width="lg">
      <pre class="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed">{{ viewing?.content }}</pre>
      <template #footer>
        <BaseButton variant="ghost" @click="viewing && copyContent(viewing)"><Copy :size="14" /> Copia</BaseButton>
        <BaseButton variant="ghost" @click="viewing && saveContent(viewing)"><Download :size="14" /> Salva file…</BaseButton>
        <BaseButton variant="primary" @click="viewOpen = false">Chiudi</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
