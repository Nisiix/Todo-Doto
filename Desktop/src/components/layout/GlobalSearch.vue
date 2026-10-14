<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Paperclip, Search } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { firstLine, searchAll, type SearchHit } from '@/services/items'
import { BUCKET_LABEL, type Attachment, type Item, type Project } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    placeholder: 'Cerca in tutti i progetti',
    results: 'Risultati della ricerca',
    noResults: (q: string) => `Nessun risultato per «${q}».`,
    inTrash: 'nel cestino',
    attachment: 'allegato',
  },
  en: {
    placeholder: 'Search all projects',
    results: 'Search results',
    noResults: (q: string) => `No results for “${q}”.`,
    inTrash: 'in the trash',
    attachment: 'attachment',
  },
})

/**
 * Ricerca in tutti i progetti visibili (nome del progetto, titolo e
 * descrizione degli elementi). I risultati compaiono sotto il campo,
 * raggruppati per progetto; ↑/↓ e Invio li scorrono e li aprono.
 * Scorciatoie: Ctrl+K oppure / per il fuoco, Esc per chiudere.
 */
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()

const inputEl = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const active = ref(0)

const hits = computed<SearchHit[]>(() => searchAll([...ws.visibleProjects, ...ws.trashedProjects], ui.search))
/** Lista piatta delle voci selezionabili, nell'ordine in cui sono mostrate. */
type Entry = { key: string; project: Project; item?: Item; attachment?: Attachment }
const entries = computed<Entry[]>(() =>
  hits.value.flatMap((h) => [
    ...(h.nameMatch ? [{ key: h.project.id, project: h.project }] : []),
    ...h.items.map((item) => ({ key: item.id, project: h.project, item })),
    ...h.attachments.map((attachment) => ({ key: attachment.id, project: h.project, attachment })),
  ]),
)
const show = computed(() => focused.value && ui.search.trim().length > 0)
watch(entries, () => (active.value = 0))

function open(entry: Entry) {
  focused.value = false
  inputEl.value?.blur()
  const query = entry.item ? { item: entry.item.id } : {}
  router.push({ name: 'project', params: { id: entry.project.id, section: entry.attachment ? 'attachments' : '' }, query })
  if (entry.item) ui.selectedItemId = entry.item.id
}
function clear() {
  ui.search = ''
  inputEl.value?.blur()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') return clear()
  if (!show.value) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = entries.value.length
    if (n) active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  } else if (e.key === 'Enter') {
    const entry = entries.value[active.value]
    if (entry) open(entry)
  }
}
function focus() {
  inputEl.value?.focus()
  inputEl.value?.select()
}
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    focus()
  } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable], [role=dialog]')) {
    e.preventDefault()
    focus()
  }
})
const entryIndex = (key: string) => entries.value.findIndex((x) => x.key === key)
</script>

<template>
  <div class="relative ml-auto w-80">
    <Search :size="15" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
    <input
      ref="inputEl"
      v-model="ui.search"
      class="field field-sm h-8 pl-8 pr-14"
      :placeholder="m.placeholder"
      role="combobox"
      :aria-label="m.placeholder"
      :aria-expanded="show"
      aria-controls="global-search-results"
      @focus="focused = true"
      @blur="focused = false"
      @keydown="onKeydown"
    />
    <span class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 gap-0.5"><span class="kbd">Ctrl</span><span class="kbd">K</span></span>

    <!-- mousedown.prevent: il click non toglie il fuoco al campo prima che scatti -->
    <div
      v-if="show"
      id="global-search-results"
      class="absolute left-0 right-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
      role="listbox"
      :aria-label="m.results"
      @mousedown.prevent
    >
      <p v-if="!hits.length" class="px-3 py-3 text-[13px] text-ink-3">{{ m.noResults(ui.search.trim()) }}</p>
      <section v-for="h in hits" :key="h.project.id" class="py-1">
        <button
          class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] font-semibold text-ink-2"
          :class="{ 'bg-accent-soft text-accent-ink': h.nameMatch && entryIndex(h.project.id) === active, 'hover:bg-surface-2': h.nameMatch }"
          role="option"
          :aria-selected="h.nameMatch && entryIndex(h.project.id) === active"
          :disabled="!h.nameMatch"
          @click="h.nameMatch && open({ key: h.project.id, project: h.project })"
        >
          <span class="truncate">{{ h.project.name }}</span>
          <span v-if="h.project.trashedAt" class="text-[11px] font-medium text-ink-3">{{ m.inTrash }}</span>
        </button>
        <button
          v-for="it in h.items"
          :key="it.id"
          class="flex w-full items-center gap-2 rounded-md py-1 pl-5 pr-2 text-left text-[13px] hover:bg-surface-2"
          :class="{ 'bg-accent-soft': entryIndex(it.id) === active }"
          role="option"
          :aria-selected="entryIndex(it.id) === active"
          @click="open({ key: it.id, project: h.project, item: it })"
        >
          <span class="h-2 w-2 shrink-0 rounded-full" :class="`bg-p-${it.priority}`" />
          <span class="min-w-0 flex-1 truncate" :class="{ 'text-ink-3 line-through': it.bucket === 'done', 'text-ink-3': it.bucket === 'trash' }">{{ firstLine(it.title) }}</span>
          <span v-if="it.bucket !== 'todo'" class="shrink-0 text-[11px] text-ink-3">{{ BUCKET_LABEL[it.bucket] }}</span>
        </button>
        <button
          v-for="a in h.attachments"
          :key="a.id"
          class="flex w-full items-center gap-2 rounded-md py-1 pl-5 pr-2 text-left text-[13px] hover:bg-surface-2"
          :class="{ 'bg-accent-soft': entryIndex(a.id) === active }"
          role="option"
          :aria-selected="entryIndex(a.id) === active"
          @click="open({ key: a.id, project: h.project, attachment: a })"
        >
          <Paperclip :size="12" class="shrink-0 text-ink-3" />
          <span class="min-w-0 flex-1 truncate">{{ a.name }}</span>
          <span class="shrink-0 text-[11px] text-ink-3">{{ m.attachment }}</span>
        </button>
      </section>
    </div>
  </div>
</template>
