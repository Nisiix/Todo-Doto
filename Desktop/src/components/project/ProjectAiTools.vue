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
import { DATE, defineMessages, localeTag } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    attachPick: 'Allega la skill (es. SKILL.md)',
    tooBig: 'Il file supera 512 KB: allega solo la definizione della skill.',
    cannotRead: (err: string) => `Non riesco a leggere il file: ${err}`,
    errName: 'Dai un nome allo strumento.',
    removeTitle: (n: string) => `Rimuovere «${n}»?`,
    removeSkill: 'Verrà rimossa anche la skill allegata.',
    copied: 'Contenuto copiato',
    copyFailed: 'Copia non riuscita',
    saveSkill: 'Salva la skill',
    skillSaved: 'Skill salvata',
    openLink: 'Apri link',
    viewSkill: 'Vedi skill',
    viewNamed: (n: string) => `Vedi ${n}`,
    copyContent: 'Copia contenuto',
    saveFile: 'Salva file…',
    title: 'Strumenti AI',
    lead: 'Connettori, plugin e skill usati per lavorare a questo progetto, con le skill allegate pronte da riusare.',
    newTool: 'Nuovo strumento',
    emptyMember: 'L’amministratore non ha ancora indicato connettori, plugin o skill per questo progetto.',
    noConnector: 'Nessun connettore (es. GitHub, Google Drive, Supabase, Figma).',
    noPlugin: 'Nessun plugin.',
    noSkill: 'Nessuna skill. Allega i file SKILL.md usati per questo progetto.',
    editTool: 'Modifica strumento',
    newToolTitle: 'Nuovo strumento AI',
    phSkill: 'Es. frontend-design',
    phPlugin: 'Es. Claude Code – plugin xlsx',
    phConnector: 'Es. GitHub, Supabase, Figma',
    skillFile: 'File della skill',
    replaceFile: 'Sostituisci file',
    attachSkill: 'Allega SKILL.md',
    chars: (n: string) => `${n} caratteri`,
    pastePlaceholder: '…oppure incolla qui il contenuto della skill',
    link: 'Link (facoltativo)',
    usage: 'Come viene usato',
    usagePlaceholder: 'Es. genera i file Excel di export; usato per la UI del modulo X…',
  },
  en: {
    attachPick: 'Attach the skill (e.g. SKILL.md)',
    tooBig: 'The file is larger than 512 KB: attach only the skill definition.',
    cannotRead: (err: string) => `Cannot read the file: ${err}`,
    errName: 'Give the tool a name.',
    removeTitle: (n: string) => `Remove “${n}”?`,
    removeSkill: 'The attached skill will be removed too.',
    copied: 'Content copied',
    copyFailed: 'Copy failed',
    saveSkill: 'Save the skill',
    skillSaved: 'Skill saved',
    openLink: 'Open link',
    viewSkill: 'View skill',
    viewNamed: (n: string) => `View ${n}`,
    copyContent: 'Copy content',
    saveFile: 'Save file…',
    title: 'AI tools',
    lead: 'Connectors, plugins and skills used to work on this project, with attached skills ready to reuse.',
    newTool: 'New tool',
    emptyMember: 'The administrator has not listed any connectors, plugins or skills for this project yet.',
    noConnector: 'No connectors (e.g. GitHub, Google Drive, Supabase, Figma).',
    noPlugin: 'No plugins.',
    noSkill: 'No skills. Attach the SKILL.md files used for this project.',
    editTool: 'Edit tool',
    newToolTitle: 'New AI tool',
    phSkill: 'E.g. frontend-design',
    phPlugin: 'E.g. Claude Code – xlsx plugin',
    phConnector: 'E.g. GitHub, Supabase, Figma',
    skillFile: 'Skill file',
    replaceFile: 'Replace file',
    attachSkill: 'Attach SKILL.md',
    chars: (n: string) => `${n} characters`,
    pastePlaceholder: '…or paste the skill content here',
    link: 'Link (optional)',
    usage: 'How it is used',
    usagePlaceholder: 'E.g. generates the Excel export files; used for the UI of module X…',
  },
})

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
  const p = await fs.pickFile(m.attachPick)
  if (!p) return
  try {
    const bytes = await fs.readBinary(p)
    if (bytes.byteLength > 512 * 1024) return (error.value = m.tooBig)
    content.value = new TextDecoder().decode(bytes)
    fileName.value = p.split(/[\\/]/).pop() ?? 'SKILL.md'
    if (!name.value) {
      const match = /^name:\s*(.+)$/m.exec(content.value)
      name.value = match ? match[1]!.trim() : fileName.value.replace(/\.md$/i, '')
    }
    error.value = ''
  } catch (e) {
    error.value = m.cannotRead(e instanceof Error ? e.message : String(e))
  }
}
async function submit() {
  if (!name.value.trim()) return (error.value = m.errName)
  const data = { kind: kind.value, name: name.value.trim(), url: url.value.trim(), notes: notes.value.trim(), fileName: fileName.value, content: content.value }
  if (editing.value) await ws.updateAiTool(props.project.id, editing.value.id, data)
  else await ws.addAiTool(props.project.id, data)
  open.value = false
}
async function remove(t: AiTool) {
  if (await confirm({ title: m.removeTitle(t.name), message: t.content ? m.removeSkill : '', confirmLabel: common.actions.remove, danger: true }))
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
    ui.toast(m.copied, 'success', undefined, 1500)
  } catch {
    ui.toast(m.copyFailed, 'warning')
  }
}
async function saveContent(t: AiTool) {
  const fs = await getFs()
  const path = await fs.saveFile(t.fileName ?? `${t.name}.md`, m.saveSkill)
  if (!path) return
  await fs.writeTextAtomic(path, t.content ?? '')
  ui.toast(m.skillSaved, 'success', undefined, 1800)
}
const openUrl = async (u: string) => (await getFs()).openExternal(u, 'link')

const menu = (t: AiTool) => [
  ...(t.url ? [{ label: m.openLink, icon: ExternalLink, onSelect: () => openUrl(t.url) }] : []),
  ...(t.content ? [{ label: m.viewSkill, icon: Eye, onSelect: () => view(t) }, { label: m.copyContent, icon: Copy, onSelect: () => copyContent(t) }, { label: m.saveFile, icon: Download, onSelect: () => saveContent(t) }] : []),
  ...(canEdit.value ? [{ sep: true, label: '' }, { label: common.actions.edit, icon: Pencil, onSelect: () => startEdit(t) }, { label: common.actions.remove, icon: Trash2, danger: true, onSelect: () => remove(t) }] : []),
]
</script>

<template>
  <div class="max-w-4xl space-y-8">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-[17px] font-bold tracking-tight">{{ m.title }}</h2>
        <p class="mt-0.5 text-[13px] text-ink-2">{{ m.lead }}</p>
      </div>
      <BaseMenu v-if="canEdit" :items="AI_TOOL_KINDS.map((k) => ({ label: AI_TOOL_LABEL[k], icon: ICON[k] as never, onSelect: () => startAdd(k) }))">
        <BaseButton size="sm" variant="primary"><Plus :size="14" /> {{ m.newTool }}</BaseButton>
      </BaseMenu>
    </div>

    <div v-if="!project.aiTools.length && !canEdit" class="max-w-lg rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2">
      {{ m.emptyMember }}
    </div>

    <section v-for="g in groups" v-else :key="g.kind">
      <h3 class="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        <component :is="ICON[g.kind]" :size="14" class="text-accent" /> {{ AI_TOOL_LABEL[g.kind] }}
        <span class="tabular-nums text-ink-3">{{ g.items.length || '' }}</span>
      </h3>
      <ul v-if="g.items.length" class="divide-y divide-line">
        <li v-for="t in g.items" :key="t.id" class="group flex items-center gap-3 py-2 pr-1 hover:bg-surface-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-[13.5px] font-semibold">
              {{ t.name }}
              <button v-if="t.content" class="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-px text-[11px] font-semibold text-accent-ink hover:underline" :title="m.viewNamed(t.fileName ?? '')" @click="view(t)"><Paperclip :size="10" /> {{ t.fileName }}</button>
            </div>
            <p v-if="t.notes" class="text-[12.5px] text-ink-2">{{ t.notes }}</p>
            <button v-if="t.url" class="truncate font-mono text-[11.5px] text-accent-ink hover:underline" @click="openUrl(t.url)">{{ t.url }}</button>
          </div>
          <span class="shrink-0 text-[11.5px] text-ink-3">{{ ws.userName(t.addedBy) }} · {{ t.addedAt ? dayjs(t.addedAt).format(DATE.dayMonth) : '' }}</span>
          <BaseMenu v-if="menu(t).length" :items="menu(t)">
            <MenuTriggerButton />
          </BaseMenu>
        </li>
      </ul>
      <p v-else class="text-[12.5px] text-ink-3">
        <template v-if="g.kind === 'connector'">{{ m.noConnector }}</template>
        <template v-else-if="g.kind === 'plugin'">{{ m.noPlugin }}</template>
        <template v-else>{{ m.noSkill }}</template>
      </p>
    </section>

    <!-- Dialog -->
    <BaseDialog v-model:open="open" :title="editing ? m.editTool : m.newToolTitle">
      <form class="space-y-4" @submit.prevent="submit">
        <SegmentedControl v-model="kind" :options="AI_TOOL_KINDS.map((k) => ({ value: k, label: AI_TOOL_LABEL[k] }))" />
        <div>
          <label class="label" for="ai-name">{{ common.name }}</label>
          <input id="ai-name" v-model="name" class="field" :placeholder="kind === 'skill' ? m.phSkill : kind === 'plugin' ? m.phPlugin : m.phConnector" data-autofocus />
        </div>
        <div v-if="kind === 'skill'">
          <span class="label">{{ m.skillFile }}</span>
          <div class="flex items-center gap-2">
            <BaseButton @click="attachSkill"><Paperclip :size="14" /> {{ fileName ? m.replaceFile : m.attachSkill }}</BaseButton>
            <span v-if="fileName" class="text-[12.5px] text-ink-2"><FileText :size="12" class="mr-1 inline" />{{ fileName }} · {{ m.chars((content?.length ?? 0).toLocaleString(localeTag)) }}</span>
          </div>
          <textarea v-model="content" class="field mt-2 min-h-28 resize-y font-mono text-[12px]" :placeholder="m.pastePlaceholder" @input="fileName = fileName ?? 'SKILL.md'" />
        </div>
        <div>
          <label class="label" for="ai-url">{{ m.link }}</label>
          <input id="ai-url" v-model="url" class="field font-mono text-[12.5px]" placeholder="https://…" />
        </div>
        <div>
          <label class="label" for="ai-notes">{{ m.usage }}</label>
          <textarea id="ai-notes" v-model="notes" class="field min-h-16 resize-y" :placeholder="m.usagePlaceholder" />
        </div>
        <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
      </form>
      <template #footer>
        <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
        <BaseButton variant="primary" @click="submit">{{ editing ? common.actions.save : common.actions.create }}</BaseButton>
      </template>
    </BaseDialog>

    <BaseDialog v-model:open="viewOpen" :title="viewing?.name ?? ''" :description="viewing?.fileName ?? ''" width="lg">
      <pre class="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed">{{ viewing?.content }}</pre>
      <template #footer>
        <BaseButton variant="ghost" @click="viewing && copyContent(viewing)"><Copy :size="14" /> {{ common.actions.copy }}</BaseButton>
        <BaseButton variant="ghost" @click="viewing && saveContent(viewing)"><Download :size="14" /> {{ m.saveFile }}</BaseButton>
        <BaseButton variant="primary" @click="viewOpen = false">{{ common.actions.close }}</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
