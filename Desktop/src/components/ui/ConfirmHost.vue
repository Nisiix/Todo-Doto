<script setup lang="ts">
import { t } from '@/i18n'
import BaseDialog from './BaseDialog.vue'
import BaseButton from './BaseButton.vue'
import { confirmState, settleConfirm } from '@/composables/useConfirm'
import { computed } from 'vue'

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
      <BaseButton variant="ghost" @click="settleConfirm(false)">{{ t('Annulla') }}</BaseButton>
      <BaseButton :variant="confirmState.danger ? 'danger' : 'primary'" data-autofocus @click="settleConfirm(true)">
        {{ confirmState.confirmLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
