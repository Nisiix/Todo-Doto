<script setup lang="ts" generic="T extends string">
/** Gruppo di opzioni mutuamente esclusive (tema, tipo allegato, …). */
defineProps<{ options: { value: T; label: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="inline-flex rounded-md border border-line p-0.5" role="radiogroup">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      class="rounded px-3 py-1 text-[13px] font-medium transition-colors"
      :class="model === o.value ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:text-ink'"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
