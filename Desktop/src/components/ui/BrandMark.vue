<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <!-- Quattro barre speculari: le due centrali sono le più alte, verso i bordi si accorciano
       (stessi colori delle priorità, stesse altezze 14 e 24 del segno nelle righe) -->
  <svg :width="size" :height="size" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="2" y="12" width="4" height="14" rx="1.5" class="fill-p-bassa" />
    <rect x="9" y="2" width="4" height="24" rx="1.5" class="fill-p-media" />
    <rect x="16" y="2" width="4" height="24" rx="1.5" class="fill-p-alta" />
    <rect x="23" y="12" width="4" height="14" rx="1.5" class="fill-p-immediata" />
  </svg>
</template>
