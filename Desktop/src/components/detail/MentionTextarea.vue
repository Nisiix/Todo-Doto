<script setup lang="ts">
import { computed, ref } from 'vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'

/**
 * Textarea con autocompletamento di @utente. Ctrl+Invio (o Invio senza Shift)
 * invia il testo tramite l'evento `submit`.
 */
const props = withDefaults(defineProps<{ placeholder?: string; rows?: number; autofocus?: boolean }>(), { rows: 2 })
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ submit: [] }>()
const ws = useWorkspaceStore()

const el = ref<HTMLTextAreaElement | null>(null)
const query = ref<string | null>(null) // testo dopo la @ mentre si digita
const cursor = ref(0)
const active = ref(0)

const candidates = computed(() => {
  if (query.value === null || !ws.isNetwork) return []
  const q = query.value.toLowerCase()
  return ws.users.filter((u) => u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)).slice(0, 6)
})

function onInput() {
  const ta = el.value
  if (!ta) return
  cursor.value = ta.selectionStart
  const before = model.value.slice(0, cursor.value)
  const m = /(?:^|\s)@([^\s@]*)$/.exec(before)
  query.value = m ? m[1]! : null
  active.value = 0
}

function pick(name: string) {
  const before = model.value.slice(0, cursor.value).replace(/@([^\s@]*)$/, `@${name} `)
  model.value = before + model.value.slice(cursor.value)
  query.value = null
  requestAnimationFrame(() => {
    el.value?.focus()
    el.value?.setSelectionRange(before.length, before.length)
  })
}

function onKeydown(e: KeyboardEvent) {
  if (candidates.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      active.value = (active.value + 1) % candidates.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      active.value = (active.value - 1 + candidates.value.length) % candidates.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(candidates.value[active.value]!.displayName)
      return
    }
    if (e.key === 'Escape') {
      query.value = null
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (model.value.trim()) emit('submit')
  }
}

defineExpose({ focus: () => el.value?.focus() })
</script>

<template>
  <div class="relative">
    <textarea
      ref="el"
      v-model="model"
      class="field resize-none text-[13.5px]"
      :rows="rows"
      :placeholder="props.placeholder"
      :autofocus="autofocus"
      @input="onInput"
      @click="onInput"
      @keydown="onKeydown"
      @blur="query = null"
    />
    <Transition name="pop">
      <ul v-if="candidates.length" class="menu-content absolute left-0 top-full mt-1 w-64">
        <li
          v-for="(u, i) in candidates"
          :key="u.id"
          class="menu-item"
          :class="{ 'bg-surface-2': i === active }"
          @mousedown.prevent="pick(u.displayName)"
          @mousemove="active = i"
        >
          <UserAvatar :name="u.displayName" size="xs" />
          <span class="flex-1 truncate">{{ u.displayName }}</span>
          <span class="text-[11px] text-ink-3">{{ u.username }}</span>
        </li>
      </ul>
    </Transition>
  </div>
</template>
