<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useStackDriftStore } from '@/stores/stackDrift'
import { useUiStore } from '@/stores/ui'
import type { Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    text: 'I file del progetto sono cambiati: lo Stack non è più aggiornato.',
    adminOnly: 'Può aggiornarlo un amministratore.',
    update: 'Aggiorna lo Stack',
    ignore: 'Ignora',
    more: (n: number) => `e altre ${n}`,
    updated: 'Stack aggiornato dai file del progetto.',
    undo: 'Annulla',
  },
  en: {
    text: 'The project files changed: the Stack is out of date.',
    adminOnly: 'An administrator can update it.',
    update: 'Update the Stack',
    ignore: 'Ignore',
    more: (n: number) => `and ${n} more`,
    updated: 'Stack updated from the project files.',
    undo: 'Undo',
  },
})

/** Avviso nel progetto quando i file dicono altro rispetto allo Stack (vedi stores/stackDrift). */
const props = defineProps<{ project: Project }>()
const ws = useWorkspaceStore()
const sd = useStackDriftStore()
const ui = useUiStore()
const busy = ref(false)

watch(
  () => props.project.id,
  () => void sd.check(props.project),
  { immediate: true },
)
const drift = computed(() => sd.driftOf(props.project))
const shown = computed(() => drift.value?.changes.slice(0, 4) ?? [])
const extra = computed(() => (drift.value?.changes.length ?? 0) - shown.value.length)

async function update() {
  busy.value = true
  const before = props.project.stack
  try {
    if (await sd.apply(props.project)) ui.toast(m.updated, 'success', { label: m.undo, run: () => void ws.updateStack(props.project.id, before) }, 9000)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="drift" class="mt-3 flex max-w-4xl items-start gap-3 rounded-lg border border-p-media/40 bg-p-media/10 px-4 py-2.5 text-[13px]" role="status" data-stack-drift>
    <RefreshCw :size="15" class="mt-0.5 shrink-0 text-p-media" />
    <div class="min-w-0 flex-1">
      <p class="font-medium">{{ m.text }}<span v-if="!ws.isAdmin" class="font-normal text-ink-2"> {{ m.adminOnly }}</span></p>
      <p class="mt-0.5 text-[12.5px] text-ink-2" data-stack-drift-changes>
        {{ shown.join(' · ') }}<template v-if="extra > 0"> · {{ m.more(extra) }}</template>
      </p>
    </div>
    <BaseButton v-if="ws.isAdmin" size="sm" variant="primary" class="shrink-0" :disabled="busy" data-stack-drift-update @click="update">{{ m.update }}</BaseButton>
    <BaseButton size="sm" variant="ghost" class="shrink-0" @click="sd.ignore(project)">{{ m.ignore }}</BaseButton>
  </div>
</template>
