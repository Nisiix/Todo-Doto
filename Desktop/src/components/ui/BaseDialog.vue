<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from 'lucide-vue-next'
import { common } from '@/i18n/common'

withDefaults(
  defineProps<{
    title: string
    description?: string
    width?: 'sm' | 'md' | 'lg' | 'xl'
  }>(),
  { width: 'md' },
)
const open = defineModel<boolean>('open', { default: false })

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-6xl' }
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <Transition name="fade">
        <DialogOverlay class="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] dark:bg-black/50" />
      </Transition>
      <Transition name="pop">
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-[var(--shadow)] outline-none"
          :class="widths[width]"
          @open-auto-focus="(e: Event) => { const el = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[data-autofocus]'); if (el) { e.preventDefault(); el.focus() } }"
        >
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogTitle class="text-[17px] font-bold tracking-tight">{{ title }}</DialogTitle>
              <DialogDescription v-if="description" class="mt-0.5 text-[13px] text-ink-2">
                {{ description }}
              </DialogDescription>
            </div>
            <DialogClose class="-mr-1 -mt-1 rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" :aria-label="common.actions.close">
              <X :size="16" />
            </DialogClose>
          </div>
          <slot />
          <div v-if="$slots.footer" class="mt-5 flex justify-end gap-2">
            <slot name="footer" />
          </div>
        </DialogContent>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>
