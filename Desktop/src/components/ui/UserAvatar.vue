<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: 'xs' | 'sm' | 'md' }>(), { size: 'sm' })

const HUES = [200, 160, 30, 280, 340, 95, 230, 15]
const initials = computed(() =>
  props.name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join(''),
)
const hue = computed(() => {
  let h = 0
  for (const c of props.name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
})
const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-[12px]' }
</script>

<template>
  <span
    class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold"
    :class="sizes[size]"
    :style="{ background: `oklch(0.88 0.06 ${hue})`, color: `oklch(0.35 0.1 ${hue})` }"
    :title="name"
  >
    {{ initials || '?' }}
  </span>
</template>
