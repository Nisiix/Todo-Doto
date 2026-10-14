<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <!-- Quattro barre di altezza crescente: lo stesso segno che marca la priorità nelle righe -->
  <svg :width="size" :height="size" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="2" y="17" width="4" height="9" rx="1.5" class="fill-p-bassa" />
    <rect x="9" y="12" width="4" height="14" rx="1.5" class="fill-p-media" />
    <rect x="16" y="7" width="4" height="19" rx="1.5" class="fill-p-alta" />
    <rect x="23" y="2" width="4" height="24" rx="1.5" class="fill-p-immediata" />
  </svg>
</template>
