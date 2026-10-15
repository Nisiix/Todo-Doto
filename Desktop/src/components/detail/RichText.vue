<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { getFs } from '@/services/fs'

/** Testo con @menzioni evidenziate e link cliccabili. */
const props = defineProps<{ text: string }>()
const ws = useWorkspaceStore()
const openLink = async (url: string) => (await getFs()).openExternal(url, 'link')

type Part = { kind: 'text' | 'mention' | 'link'; value: string }

const parts = computed<Part[]>(() => {
  const names = ws.users.flatMap((u) => [u.displayName, u.username]).filter(Boolean).sort((a, b) => b.length - a.length)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(https?://[^\\s]+)${names.length ? `|(@(?:${names.map(esc).join('|')}))` : ''}`, 'g')
  const out: Part[] = []
  let last = 0
  for (const m of props.text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'text', value: props.text.slice(last, m.index) })
    out.push(m[1] ? { kind: 'link', value: m[1] } : { kind: 'mention', value: m[2]! })
    last = m.index! + m[0].length
  }
  if (last < props.text.length) out.push({ kind: 'text', value: props.text.slice(last) })
  return out
})
</script>

<template>
  <span class="whitespace-pre-wrap break-words">
    <template v-for="(p, i) in parts" :key="i">
      <span v-if="p.kind === 'mention'" class="rounded bg-accent-soft px-1 font-semibold text-accent-ink">{{ p.value }}</span>
      <a v-else-if="p.kind === 'link'" :href="p.value" class="text-accent-ink underline" @click.prevent="openLink(p.value)">{{ p.value }}</a>
      <template v-else>{{ p.value }}</template>
    </template>
  </span>
</template>
