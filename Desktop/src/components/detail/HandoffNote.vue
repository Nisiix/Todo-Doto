<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRightLeft, Loader2, Sparkles } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useGitStore } from '@/stores/git'
import { useAiStore, withAi } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { handoffFacts, handoffNote, type HandoffInput } from '@/services/handoff'
import { handoffSummary } from '@/services/aiAssist'
import { openBlockers } from '@/services/dependencies'
import { firstLine } from '@/services/items'
import { taskCode } from '@/services/gitLink'
import type { Item, Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: (n: string) => `Lasci una nota a ${n}?`,
    hint: 'Il task è passato a un’altra persona: una nota di passaggio, da rivedere, si aggiunge come commento (con la menzione).',
    add: 'Aggiungi come commento',
    ai: 'Riscrivi con l’IA',
    aiFailed: 'L’IA locale non ha risposto: la nota resta com’è',
    skip: 'No, grazie',
    added: 'Nota di passaggio aggiunta',
  },
  en: {
    title: (n: string) => `Leave a note for ${n}?`,
    hint: 'The task moved to someone else: a handover note, to review, is added as a comment (with the mention).',
    add: 'Add as a comment',
    ai: 'Rewrite with AI',
    aiFailed: 'The local AI did not answer: the note stays as it is',
    skip: 'No, thanks',
    added: 'Handover note added',
  },
})

/** Nota di passaggio proposta dopo aver cambiato l'assegnatario del task. */
const props = defineProps<{ item: Item; project: Project; fromId: string; toId: string }>()
const emit = defineEmits<{ done: [] }>()
const ws = useWorkspaceStore()
const git = useGitStore()
const ai = useAiStore()
const ui = useUiStore()

const input = computed<HandoffInput>(() => ({
  item: props.item,
  fromName: ws.userName(props.fromId),
  toName: ws.userName(props.toId),
  openBlockers: openBlockers(props.item, props.project.items).map((b) => `${b.seq ? `${taskCode(b.seq)} ` : ''}${firstLine(b.title)}`),
  commits: git.commitsOf(props.project.id, props.item),
  userName: (id) => ws.userName(id),
}))
const text = ref('')
watch(() => props.toId, () => (text.value = handoffNote(input.value)), { immediate: true })

const busy = ref(false)
async function rewrite() {
  busy.value = true
  try {
    const r = await withAi((cfg) => handoffSummary(cfg, handoffFacts(input.value)))
    if (r) text.value = r
    else ui.toast(m.aiFailed, 'warning', undefined, 4000)
  } catch {
    ui.toast(m.aiFailed, 'warning', undefined, 4000)
  } finally {
    busy.value = false
  }
}
async function add() {
  if (!text.value.trim()) return
  await ws.addComment(props.project.id, props.item.id, text.value)
  ui.toast(m.added, 'success', undefined, 2000)
  emit('done')
}
</script>

<template>
  <div class="rounded-lg border border-accent/40 bg-accent-soft/40 p-3" data-handoff>
    <p class="flex items-center gap-1.5 text-[13px] font-semibold"><ArrowRightLeft :size="14" class="text-accent-ink" /> {{ m.title(ws.userName(toId)) }}</p>
    <p class="mt-0.5 text-[11.5px] text-ink-3">{{ m.hint }}</p>
    <textarea v-model="text" rows="6" class="field mt-2 resize-y text-[12.5px] leading-relaxed" data-handoff-text />
    <div class="mt-2 flex flex-wrap gap-1.5">
      <BaseButton size="sm" variant="primary" data-handoff-add @click="add()">{{ m.add }}</BaseButton>
      <BaseButton v-if="ai.active" size="sm" variant="ghost" :disabled="busy" data-handoff-ai @click="rewrite()">
        <Loader2 v-if="busy" :size="13" class="animate-spin" /><Sparkles v-else :size="13" /> {{ m.ai }}
      </BaseButton>
      <BaseButton size="sm" variant="ghost" class="ml-auto" data-handoff-skip @click="emit('done')">{{ m.skip }}</BaseButton>
    </div>
  </div>
</template>
