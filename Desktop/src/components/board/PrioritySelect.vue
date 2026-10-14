<script setup lang="ts">
import { PRIORITIES, PRIORITY_LABEL, type Priority } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({ it: { priority: (p: string) => `Priorità: ${p}` }, en: { priority: (p: string) => `Priority: ${p}` } })

defineProps<{ compact?: boolean }>()
const model = defineModel<Priority>({ required: true })
</script>

<template>
  <span class="relative inline-flex items-center">
    <span class="pointer-events-none absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" :class="`bg-p-${model}`" />
    <select
      v-model="model"
      class="h-6 cursor-default appearance-none rounded-full border border-line bg-surface pl-5 pr-2 text-[12px] font-medium text-ink-2 hover:border-line-strong hover:text-ink focus:border-accent focus:outline-none"
      :class="{ 'w-6 !pl-0 !pr-0 text-transparent': compact }"
      :title="m.priority(PRIORITY_LABEL[model])"
      @click.stop
    >
      <option v-for="p in PRIORITIES" :key="p" :value="p">{{ PRIORITY_LABEL[p] }}</option>
    </select>
  </span>
</template>
