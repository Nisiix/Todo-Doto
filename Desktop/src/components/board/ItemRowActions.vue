<script setup lang="ts">
import BaseMenu from '@/components/ui/BaseMenu.vue'
import MenuTriggerButton from '@/components/ui/MenuTriggerButton.vue'
import { useItemActions } from '@/composables/useItemActions'
import type { Item } from '@/types'

/** Il menu "⋯" di una riga: stesse voci e stessi permessi del pannello di dettaglio. */
const props = defineProps<{ item: Item; projectId: string; readOnly?: boolean }>()
const actions = useItemActions(
  () => props.item,
  () => props.projectId,
  () => props.readOnly,
)
</script>

<template>
  <BaseMenu v-if="actions.menu.value.length" :items="actions.menu.value">
    <MenuTriggerButton />
  </BaseMenu>
</template>
