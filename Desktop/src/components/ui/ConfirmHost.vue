<script setup lang="ts">
import BaseDialog from './BaseDialog.vue'
import BaseButton from './BaseButton.vue'
import { confirmState, settleConfirm } from '@/composables/useConfirm'
import { computed } from 'vue'
import { common } from '@/i18n/common'

const open = computed({
  get: () => confirmState.open,
  set: (v) => {
    if (!v) settleConfirm(false)
  },
})
</script>

<template>
  <BaseDialog v-model:open="open" :title="confirmState.title" :description="confirmState.message" width="sm">
    <template #footer>
      <BaseButton variant="ghost" @click="settleConfirm(false)">{{ common.actions.cancel }}</BaseButton>
      <BaseButton :variant="confirmState.danger ? 'danger' : 'primary'" data-autofocus @click="settleConfirm(true)">
        {{ confirmState.confirmLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
