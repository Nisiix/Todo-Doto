<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'
import type { Label } from '@/types'

/** Gestione delle etichette del workspace: nome e colore, valide per tutti i progetti. */
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const confirm = useConfirm()

const PALETTE = ['#9B7BD6', '#4FB3E8', '#5B8DEF', '#7FA98F', '#D9A441', '#E07A3F', '#D64545', '#C96A9E', '#6B7280']
const newName = ref('')
const newColor = ref(PALETTE[0]!)

async function add() {
  const n = newName.value.trim()
  if (!n) return
  await ws.addLabel(n, newColor.value)
  newName.value = ''
}
function rename(l: Label, e: Event) {
  const name = (e.target as HTMLInputElement).value.trim()
  if (name && name !== l.name) ws.updateLabel(l.id, { name })
  else (e.target as HTMLInputElement).value = l.name
}
async function remove(l: Label) {
  const ok = await confirm({
    title: t('Eliminare l’etichetta «{name}»?', { name: l.name }),
    message: t('Verrà tolta dagli elementi che la usano, in tutti i progetti.'),
    confirmLabel: t('Elimina etichetta'),
    danger: true,
  })
  if (ok) await ws.deleteLabel(l.id)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="t('Etichette')" :description="t('Badge da assegnare agli elementi. Valgono per tutto il workspace.')" width="sm">
    <ul v-if="ws.tree.labels.length" class="mb-4 divide-y divide-line">
      <li v-for="l in ws.tree.labels" :key="l.id" class="flex items-center gap-2 py-2">
        <label class="relative h-6 w-6 shrink-0 cursor-default rounded-full" :style="{ background: l.color }" :title="t('Cambia colore')">
          <input type="color" class="absolute inset-0 h-full w-full cursor-default opacity-0" :value="l.color" @change="ws.updateLabel(l.id, { color: ($event.target as HTMLInputElement).value })" />
        </label>
        <input class="field field-sm flex-1" :value="l.name" :aria-label="`Nome etichetta ${l.name}`" @change="rename(l, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
        <BaseButton size="icon-sm" variant="ghost" :title="`Elimina ${l.name}`" @click="remove(l)"><Trash2 :size="14" /></BaseButton>
      </li>
    </ul>
    <p v-else class="mb-4 text-[13px] text-ink-2">{{ t('Nessuna etichetta ancora. Crea la prima qui sotto.') }}</p>

    <form class="space-y-2" @submit.prevent="add">
      <div class="flex gap-2">
        <input v-model="newName" class="field field-sm flex-1" :placeholder="t('Nuova etichetta, es. Bug, Cliente, Interno')" data-autofocus />
        <BaseButton type="submit" variant="primary" size="sm" :disabled="!newName.trim()"><Plus :size="14" /> {{ t('Aggiungi') }}</BaseButton>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in PALETTE"
          :key="c"
          type="button"
          class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
          :class="newColor === c ? 'border-ink' : 'border-transparent'"
          :style="{ background: c }"
          :aria-label="`Colore ${c}`"
          @click="newColor = c"
        />
      </div>
    </form>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">{{ t('Chiudi') }}</BaseButton>
    </template>
  </BaseDialog>
</template>
