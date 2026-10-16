<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { withAi } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import { tasksFromText, type ProposedTask } from '@/services/aiAssist'
import { PRIORITIES, PRIORITY_LABEL } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Task da un testo',
    lead: 'Incolla appunti, una mail o un verbale: ne ricavo le cose da fare. Scegli tu quali creare.',
    placeholder: 'Es. «Dalla riunione di oggi: correggere l’export XBRL entro venerdì, aggiungere la verifica email all’accesso…»',
    extract: 'Ricava i task',
    extracting: 'Leggo il testo…',
    none: 'Nel testo non ho trovato nuove cose da fare.',
    failed: 'Non è stato possibile leggere il testo adesso. Controlla l’IA locale nelle Impostazioni.',
    create: (n: number) => (n === 1 ? 'Crea 1 task' : `Crea ${n} task`),
    created: (n: number) => (n === 1 ? '1 task creato' : `${n} task creati`),
    back: 'Modifica il testo',
  },
  en: {
    title: 'Tasks from a text',
    lead: 'Paste notes, an email or meeting minutes: I will pick out the things to do. You choose which ones to create.',
    placeholder: 'E.g. “From today’s meeting: fix the XBRL export by Friday, add email verification to sign-in…”',
    extract: 'Find tasks',
    extracting: 'Reading the text…',
    none: 'I found nothing new to do in the text.',
    failed: 'Could not read the text right now. Check the local AI in Settings.',
    create: (n: number) => (n === 1 ? 'Create 1 task' : `Create ${n} tasks`),
    created: (n: number) => (n === 1 ? '1 task created' : `${n} tasks created`),
    back: 'Edit the text',
  },
})

/** Dal testo incollato ai task proposti (IA locale); si creano solo quelli scelti. */
const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()

const text = ref('')
const busy = ref(false)
const message = ref('')
const proposals = ref<(ProposedTask & { pick: boolean })[] | null>(null)
watch(open, (o) => {
  if (o) {
    message.value = ''
    proposals.value = null
  }
})

async function extract() {
  if (!text.value.trim() || busy.value) return
  busy.value = true
  message.value = ''
  const existing = (ws.projects[props.projectId]?.items ?? []).filter((i) => i.bucket === 'todo').map((i) => i.title)
  const r = await withAi((cfg) => tasksFromText(cfg, text.value, existing))
  busy.value = false
  if (!r) return (message.value = m.failed)
  if (!r.length) return (message.value = m.none)
  proposals.value = r.map((t) => ({ ...t, pick: true }))
}

const picked = computed(() => proposals.value?.filter((p) => p.pick && p.title.trim()) ?? [])
async function create() {
  const list = picked.value
  for (const t of list) await ws.addItem(props.projectId, { title: t.title.trim(), notes: t.notes, priority: t.priority })
  ui.toast(m.created(list.length), 'success', undefined, 3000)
  text.value = ''
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.lead" width="lg">
    <div data-tasks-from-text>
      <template v-if="!proposals">
        <textarea v-model="text" class="field min-h-44 resize-y text-[13.5px] leading-relaxed" :placeholder="m.placeholder" data-autofocus data-text-source @keydown.ctrl.enter.prevent="extract" />
        <p v-if="busy" class="mt-2 flex items-center gap-2 text-[13px] text-ink-2"><Loader2 :size="14" class="animate-spin" /> {{ m.extracting }}</p>
        <p v-else-if="message" class="mt-2 text-[13px] text-ink-2" data-text-message>{{ message }}</p>
      </template>
      <ul v-else class="max-h-[50vh] space-y-1.5 overflow-y-auto">
        <li v-for="(p, i) in proposals" :key="i" class="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2" data-proposed-task>
          <input v-model="p.pick" type="checkbox" class="mt-2 accent-accent" :aria-label="p.title" />
          <div class="min-w-0 flex-1 space-y-1">
            <input v-model="p.title" class="field h-8 text-[13.5px] font-medium" />
            <p v-if="p.notes" class="whitespace-pre-wrap text-[12px] text-ink-3">{{ p.notes }}</p>
          </div>
          <select v-model="p.priority" class="field h-8 w-auto text-[12.5px]">
            <option v-for="x in PRIORITIES" :key="x" :value="x">{{ PRIORITY_LABEL[x] }}</option>
          </select>
        </li>
      </ul>
    </div>
    <template #footer>
      <template v-if="!proposals">
        <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
        <BaseButton variant="primary" :disabled="busy || !text.trim()" data-extract-tasks @click="extract">{{ m.extract }}</BaseButton>
      </template>
      <template v-else>
        <BaseButton variant="ghost" @click="proposals = null">{{ m.back }}</BaseButton>
        <BaseButton variant="primary" :disabled="!picked.length" data-create-tasks @click="create">{{ m.create(picked.length) }}</BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
