<script setup lang="ts">
import { t } from '@/i18n'
import { useUiStore } from '@/stores/ui'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-vue-next'

const ui = useUiStore()
const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }
const colors = { info: 'text-accent', success: 'text-ok', warning: 'text-warn', error: 'text-danger' }
</script>

<template>
  <div class="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] shadow-[var(--shadow)]"
        role="status"
      >
        <component :is="icons[toast.tone]" :size="16" :class="colors[toast.tone]" class="shrink-0" />
        <span class="flex-1">{{ toast.text }}</span>
        <button
          v-if="toast.action"
          class="font-semibold text-accent-ink hover:underline"
          @click="toast.action.run(); ui.dismissToast(toast.id)"
        >
          {{ toast.action.label }}
        </button>
        <button class="text-ink-3 hover:text-ink" :aria-label="t('Chiudi')" @click="ui.dismissToast(toast.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>
