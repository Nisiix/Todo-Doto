<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import type { Component } from 'vue'

export interface MenuItem {
  label: string
  icon?: Component
  danger?: boolean
  disabled?: boolean
  sep?: boolean
  onSelect?: () => void
}

withDefaults(defineProps<{ items: MenuItem[]; align?: 'start' | 'end' }>(), { align: 'end' })
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu-content" :align="align" :side-offset="4">
        <template v-for="(it, i) in items" :key="i">
          <DropdownMenuSeparator v-if="it.sep" class="menu-sep" />
          <DropdownMenuItem
            v-else
            class="menu-item"
            :class="{ 'menu-item-danger': it.danger }"
            :disabled="it.disabled"
            @select="it.onSelect?.()"
          >
            <component :is="it.icon" v-if="it.icon" :size="14" class="shrink-0 opacity-80" />
            {{ it.label }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
