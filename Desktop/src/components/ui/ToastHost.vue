<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-vue-next'
import { common } from '@/i18n/common'

const ui = useUiStore()
const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }
const colors = { info: 'text-accent', success: 'text-ok', warning: 'text-warn', error: 'text-danger' }
</script>

<template>
  <div class="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] shadow-[var(--shadow)]"
        role="status"
      >
        <component :is="icons[t.tone]" :size="16" :class="colors[t.tone]" class="shrink-0" />
        <span class="flex-1">{{ t.text }}</span>
        <button
          v-if="t.action"
          class="font-semibold text-accent-ink hover:underline"
          @click="t.action.run(); ui.dismissToast(t.id)"
        >
          {{ t.action.label }}
        </button>
        <button class="text-ink-3 hover:text-ink" :aria-label="common.actions.close" @click="ui.dismissToast(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>
