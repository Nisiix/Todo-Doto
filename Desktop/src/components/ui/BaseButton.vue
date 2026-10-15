<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'
    size?: 'sm' | 'md' | 'icon' | 'icon-sm'
    type?: 'button' | 'submit'
    disabled?: boolean
    title?: string
  }>(),
  { variant: 'outline', size: 'md', type: 'button' },
)

const cls = computed(() => {
  const base =
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 select-none'
  const sizes = {
    sm: 'h-7 px-2.5 text-[12.5px]',
    md: 'h-9 px-3.5 text-[13.5px]',
    icon: 'h-9 w-9',
    'icon-sm': 'h-7 w-7',
  }
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-strong dark:text-[#0d1b24]',
    outline: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    soft: 'bg-accent-soft text-accent-ink hover:brightness-95 dark:hover:brightness-110',
    danger: 'bg-danger text-white hover:brightness-95',
  }
  return `${base} ${sizes[props.size]} ${variants[props.variant]}`
})
</script>

<template>
  <button :type="type" :class="cls" :disabled="disabled" :title="title">
    <slot />
  </button>
</template>
