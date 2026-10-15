<script setup lang="ts">
import { t } from '@/i18n'
import { MoreHorizontal } from 'lucide-vue-next'

/**
 * Pulsante "⋯" che apre un BaseMenu. Di norma è invisibile finché il
 * contenitore (con classe `group`) non è in hover, oppure finché il menu è aperto.
 */
withDefaults(defineProps<{ label?: string; size?: number; alwaysVisible?: boolean }>(), {
  label: t('Azioni'),
  size: 15,
  alwaysVisible: false,
})
</script>

<template>
  <button
    type="button"
    class="shrink-0 rounded-md p-1 text-ink-3 hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100"
    :class="alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100'"
    :aria-label="label"
    @click.stop
  >
    <MoreHorizontal :size="size" />
  </button>
</template>
