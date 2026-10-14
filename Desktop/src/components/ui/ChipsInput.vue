<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

/** Elenco di valori liberi (es. linguaggi): Invio o virgola per aggiungere, × per togliere. */
withDefaults(defineProps<{ placeholder?: string; suggestions?: string[] }>(), { placeholder: 'Aggiungi…', suggestions: () => [] })
const model = defineModel<string[]>({ required: true })
const draft = ref('')

function add(raw = draft.value) {
  const v = raw.trim().replace(/,$/, '')
  if (v && !model.value.some((x) => x.toLowerCase() === v.toLowerCase())) model.value = [...model.value, v]
  draft.value = ''
}
const remove = (v: string) => (model.value = model.value.filter((x) => x !== v))
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    add()
  } else if (e.key === 'Backspace' && !draft.value && model.value.length) remove(model.value[model.value.length - 1]!)
}
</script>

<template>
  <div class="field flex min-h-9 flex-wrap items-center gap-1 py-1">
    <span v-for="v in model" :key="v" class="inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft pl-2 pr-1 text-[12px] font-semibold text-accent-ink">
      {{ v }}
      <button type="button" class="rounded-full p-0.5 hover:bg-accent/20" :aria-label="`Togli ${v}`" @click="remove(v)"><X :size="11" /></button>
    </span>
    <input v-model="draft" class="min-w-24 flex-1 bg-transparent text-[13px] focus:outline-none" :placeholder="model.length ? '' : placeholder" :list="suggestions.length ? 'chips-sugg' : undefined" @keydown="onKey" @blur="add()" />
    <datalist v-if="suggestions.length" id="chips-sugg"><option v-for="s in suggestions" :key="s" :value="s" /></datalist>
  </div>
</template>
