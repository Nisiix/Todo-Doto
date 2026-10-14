<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: 'Workspace protetto',
    description: (n: string) => `«${n}» è condiviso in rete. Inserisci la password: verrà ricordata su questo PC.`,
    enter: 'Entra',
  },
  en: {
    title: 'Protected workspace',
    description: (n: string) => `“${n}” is shared on the network. Enter the password: it will be remembered on this PC.`,
    enter: 'Enter',
  },
})

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
    :title="m.title"
    :description="m.description(ws.meta?.name ?? '')"
    width="sm"
  >
    <form @submit.prevent="submit">
      <label class="label" for="pw">Password</label>
      <input id="pw" v-model="password" type="password" class="field" autocomplete="current-password" data-autofocus />
      <p v-if="error" class="mt-2 text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="busy || !password" @click="submit">{{ m.enter }}</BaseButton>
    </template>
  </BaseDialog>
</template>
