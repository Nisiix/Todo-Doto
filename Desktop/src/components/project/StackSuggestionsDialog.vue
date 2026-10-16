<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import type { StackProposal } from '@/services/aiStack'
import { SETUP_STEP_LABEL } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Altri elementi da aggiungere?',
    lead: 'L’analisi ha trovato anche questi elementi, meno certi di quelli dichiarati dai file: scegli quali aggiungere allo stack. Nulla di quanto c’è già viene cambiato.',
    groups: { language: 'Linguaggi', framework: 'Framework', prerequisite: 'Prerequisiti', step: 'Passi di configurazione', envVar: 'Variabili d’ambiente', notes: 'Note' },
    all: 'Seleziona tutti',
    none: 'Nessuno',
    skip: 'Non aggiungere',
    add: (n: number) => (n ? `Aggiungi ${n}` : 'Aggiungi'),
    from: (r: string) => `Da: ${r}`,
    version: (v: string) => `versione ${v}`,
  },
  en: {
    title: 'Add more items?',
    lead: 'The analysis also found these items, less certain than those declared by the files: choose which ones to add to the stack. Nothing already there is changed.',
    groups: { language: 'Languages', framework: 'Frameworks', prerequisite: 'Prerequisites', step: 'Setup steps', envVar: 'Environment variables', notes: 'Notes' },
    all: 'Select all',
    none: 'None',
    skip: 'Don’t add',
    add: (n: number) => (n ? `Add ${n}` : 'Add'),
    from: (r: string) => `From: ${r}`,
    version: (v: string) => `version ${v}`,
  },
})

/** Suggerimenti dell'analisi approfondita dello Stack: l'amministratore sceglie cosa aggiungere. */
const props = defineProps<{ proposals: StackProposal[] }>()
const emit = defineEmits<{ apply: [selected: StackProposal[]] }>()
const open = defineModel<boolean>('open', { default: false })

const selected = ref(new Set<string>())
watch(
  () => [open.value, props.proposals] as const,
  ([o]) => {
    if (o) selected.value = new Set(props.proposals.map((p) => p.id))
  },
  { immediate: true },
)
const toggle = (id: string) => {
  const s = new Set(selected.value)
  if (!s.delete(id)) s.add(id)
  selected.value = s
}

const ORDER: StackProposal['kind'][] = ['language', 'framework', 'prerequisite', 'step', 'envVar', 'notes']
const groups = computed(() => ORDER.map((kind) => ({ kind, label: m.groups[kind], items: props.proposals.filter((p) => p.kind === kind) })).filter((g) => g.items.length))

function title(p: StackProposal): string {
  switch (p.kind) {
    case 'language':
    case 'framework':
      return p.value
    case 'prerequisite':
      return p.prerequisite.name
    case 'step':
      return p.step.title
    case 'envVar':
      return p.envVar.key
    case 'notes':
      return p.text
  }
}
function detail(p: StackProposal): string[] {
  switch (p.kind) {
    case 'prerequisite':
      return [p.prerequisite.version && m.version(p.prerequisite.version), p.reason && m.from(p.reason)].filter(Boolean) as string[]
    case 'step':
      return [p.step.command || (p.step.kind !== 'command' ? SETUP_STEP_LABEL[p.step.kind] : ''), p.step.notes].filter(Boolean)
    case 'envVar':
      return p.envVar.notes ? [p.envVar.notes] : []
    default:
      return []
  }
}

function apply() {
  emit(
    'apply',
    props.proposals.filter((p) => selected.value.has(p.id)),
  )
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.lead" width="lg">
    <div class="space-y-4" data-stack-suggestions>
      <div class="flex gap-3 text-[12.5px]">
        <button type="button" class="font-medium text-accent hover:underline" @click="selected = new Set(proposals.map((p) => p.id))">{{ m.all }}</button>
        <button type="button" class="font-medium text-ink-3 hover:underline" @click="selected = new Set()">{{ m.none }}</button>
      </div>
      <section v-for="g in groups" :key="g.kind">
        <h3 class="label">{{ g.label }}</h3>
        <ul class="space-y-1">
          <li v-for="p in g.items" :key="p.id">
            <label class="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2" :data-suggestion="p.kind">
              <input type="checkbox" class="mt-0.5 accent-accent" :checked="selected.has(p.id)" @change="toggle(p.id)" />
              <span class="min-w-0 flex-1">
                <span class="block text-[13.5px]" :class="p.kind === 'notes' ? 'whitespace-pre-wrap text-ink-2' : 'font-medium'">{{ title(p) }}</span>
                <span v-for="(d, i) in detail(p)" :key="i" class="block break-words text-[12px] text-ink-3" :class="{ 'font-mono': p.kind === 'step' && i === 0 && p.step.command }">{{ d }}</span>
              </span>
            </label>
          </li>
        </ul>
      </section>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ m.skip }}</BaseButton>
      <BaseButton variant="primary" :disabled="!selected.size" data-apply-suggestions @click="apply">{{ m.add(selected.size) }}</BaseButton>
    </template>
  </BaseDialog>
</template>
