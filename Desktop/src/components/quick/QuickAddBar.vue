<script setup lang="ts">
import { ref } from 'vue'
import { CornerDownLeft, Plus } from 'lucide-vue-next'
import QuickAddChips from './QuickAddChips.vue'
import { useQuickAdd } from '@/composables/useQuickAdd'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    placeholder: 'Aggiungi un task… es. Esportazione CSV !alta @mario #bug entro venerdì',
    label: 'Aggiungi un task rapidamente',
    hint: '!priorità · @persona · #etichetta · entro venerdì, per domani, ^15/11, tra 3 giorni · Invio per aggiungere',
    empty: 'Scrivi il titolo del task, non solo i comandi.',
  },
  en: {
    placeholder: 'Add a task… e.g. CSV export !high @mario #bug by friday',
    label: 'Quickly add a task',
    hint: '!priority · @person · #label · by friday, by tomorrow, ^11/15, in 3 days · Enter to add',
    empty: 'Write the task title, not just the commands.',
  },
})

/**
 * Inserimento rapido sopra la lista «Da fare»: si scrive il task con i comandi
 * e Invio lo crea subito, senza dialog. Ciò che è riconosciuto si vede prima.
 */
const props = defineProps<{ projectId: string }>()
const ws = useWorkspaceStore()
const ui = useUiStore()
const text = ref('')
const busy = ref(false)
const { parsed, keep } = useQuickAdd(text)

async function submit() {
  const p = parsed.value
  if (!text.value.trim() || busy.value) return
  if (!p.title) return ui.toast(m.empty, 'warning', undefined, 3000)
  busy.value = true
  try {
    const item = await ws.addItem(props.projectId, {
      title: p.title,
      ...(p.priority ? { priority: p.priority } : {}),
      assigneeId: p.assigneeId,
      labelId: p.labelId,
      ...(p.dueDate ? { status: 'confermato' as const, dueDate: p.dueDate } : {}),
    })
    text.value = ''
    // La riga nuova lampeggia nella lista: niente avviso per ogni task aggiunto di fila
    ui.flashItems([item.id])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mb-3" data-quick-add>
    <label class="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-accent" :aria-label="m.label">
      <Plus :size="15" class="shrink-0 text-ink-3" />
      <input
        v-model="text"
        class="h-10 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
        :placeholder="m.placeholder"
        :aria-label="m.label"
        :disabled="busy"
        data-quick-input
        @keydown.enter.prevent="submit()"
        @keydown.esc.prevent="text = ''"
      />
      <CornerDownLeft v-if="text.trim()" :size="14" class="shrink-0 text-ink-3" />
    </label>
    <!-- Solo mentre si scrive: se comparisse anche col solo fuoco, perdendolo la lista salirebbe sotto il clic -->
    <div v-if="text.trim()" class="mt-1.5 space-y-1 px-1">
      <QuickAddChips :parsed="parsed" @remove="keep" />
      <p class="text-[11.5px] text-ink-3">{{ m.hint }}</p>
    </div>
  </div>
</template>
