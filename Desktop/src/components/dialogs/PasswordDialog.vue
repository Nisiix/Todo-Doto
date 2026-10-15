<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ unlocked: [] }>()
const ws = useWorkspaceStore()
const password = ref('')
const error = ref('')
const busy = ref(false)

watch(open, (o) => {
  if (o) {
    password.value = ''
    error.value = ''
  } else if (ws.status === 'locked') ws.close()
})

async function submit() {
  busy.value = true
  const r = await ws.unlock(password.value)
  busy.value = false
  if (r.ok) {
    open.value = false
    emit('unlocked')
  } else if ('error' in r) error.value = r.error
}
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="t('Workspace protetto')"
    :description="`«${ws.meta?.name ?? ''}» è condiviso in rete. Inserisci la password: verrà ricordata su questo PC.`"
    width="sm"
  >
    <form @submit.prevent="submit">
      <label class="label" for="pw">{{ t('Password') }}</label>
      <input id="pw" v-model="password" type="password" class="field" autocomplete="current-password" data-autofocus />
      <p v-if="error" class="mt-2 text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ t('Annulla') }}</BaseButton>
      <BaseButton variant="primary" :disabled="busy || !password" @click="submit">{{ t('Entra') }}</BaseButton>
    </template>
  </BaseDialog>
</template>
