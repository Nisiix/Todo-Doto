<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { common } from '@/i18n/common'

/** Dialog generico per chiedere un nome (cartelle, cartelle allegati…). */
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    initial?: string
    placeholder?: string
    confirmLabel?: string
    withColor?: boolean
    initialColor?: string
  }>(),
  { initial: '', placeholder: common.name, confirmLabel: common.actions.save, withColor: false, initialColor: '#4FB3E8' },
)
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submit: [name: string, color: string] }>()

const PALETTE = ['#4FB3E8', '#7FA98F', '#D9A441', '#E07A3F', '#D64545', '#9B7BD6', '#5B8DEF', '#C96A9E', '#6B7280']

const name = ref('')
const color = ref(PALETTE[0]!)
watch(open, (o) => {
  if (o) {
    name.value = props.initial
    color.value = props.initialColor
  }
})

function submit() {
  if (!name.value.trim()) return
  emit('submit', name.value.trim(), color.value)
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :description="description" width="sm">
    <form class="space-y-3" @submit.prevent="submit">
      <input v-model="name" class="field" :placeholder="placeholder" data-autofocus />
      <div v-if="withColor" class="flex flex-wrap gap-2">
        <button
          v-for="c in PALETTE"
          :key="c"
          type="button"
          class="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
          :class="color === c ? 'border-ink' : 'border-transparent'"
          :style="{ background: c }"
          :aria-label="c"
          @click="color = c"
        />
      </div>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" :disabled="!name.trim()" @click="submit">{{ confirmLabel }}</BaseButton>
    </template>
  </BaseDialog>
</template>
