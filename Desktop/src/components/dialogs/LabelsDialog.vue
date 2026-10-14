<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'
import type { Label } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    deleteTitle: (n: string) => `Eliminare l’etichetta «${n}»?`,
    deleteMessage: 'Verrà tolta dagli elementi che la usano, in tutti i progetti.',
    deleteConfirm: 'Elimina etichetta',
    title: 'Etichette',
    description: 'Badge da assegnare agli elementi. Valgono per tutto il workspace.',
    changeColor: 'Cambia colore',
    labelName: (n: string) => `Nome etichetta ${n}`,
    deleteNamed: (n: string) => `Elimina ${n}`,
    empty: 'Nessuna etichetta ancora. Crea la prima qui sotto.',
    newPlaceholder: 'Nuova etichetta, es. Bug, Cliente, Interno',
    color: (c: string) => `Colore ${c}`,
  },
  en: {
    deleteTitle: (n: string) => `Delete the label “${n}”?`,
    deleteMessage: 'It will be removed from the items that use it, in every project.',
    deleteConfirm: 'Delete label',
    title: 'Labels',
    description: 'Badges to assign to items. They apply to the whole workspace.',
    changeColor: 'Change color',
    labelName: (n: string) => `Label name ${n}`,
    deleteNamed: (n: string) => `Delete ${n}`,
    empty: 'No labels yet. Create the first one below.',
    newPlaceholder: 'New label, e.g. Bug, Customer, Internal',
    color: (c: string) => `Color ${c}`,
  },
})

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
    title: m.deleteTitle(l.name),
    message: m.deleteMessage,
    confirmLabel: m.deleteConfirm,
    danger: true,
  })
  if (ok) await ws.deleteLabel(l.id)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="sm">
    <ul v-if="ws.tree.labels.length" class="mb-4 divide-y divide-line">
      <li v-for="l in ws.tree.labels" :key="l.id" class="flex items-center gap-2 py-2">
        <label class="relative h-6 w-6 shrink-0 cursor-default rounded-full" :style="{ background: l.color }" :title="m.changeColor">
          <input type="color" class="absolute inset-0 h-full w-full cursor-default opacity-0" :value="l.color" @change="ws.updateLabel(l.id, { color: ($event.target as HTMLInputElement).value })" />
        </label>
        <input class="field field-sm flex-1" :value="l.name" :aria-label="m.labelName(l.name)" @change="rename(l, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
        <BaseButton size="icon-sm" variant="ghost" :title="m.deleteNamed(l.name)" @click="remove(l)"><Trash2 :size="14" /></BaseButton>
      </li>
    </ul>
    <p v-else class="mb-4 text-[13px] text-ink-2">{{ m.empty }}</p>

    <form class="space-y-2" @submit.prevent="add">
      <div class="flex gap-2">
        <input v-model="newName" class="field field-sm flex-1" :placeholder="m.newPlaceholder" data-autofocus />
        <BaseButton type="submit" variant="primary" size="sm" :disabled="!newName.trim()"><Plus :size="14" /> {{ common.actions.add }}</BaseButton>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in PALETTE"
          :key="c"
          type="button"
          class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
          :class="newColor === c ? 'border-ink' : 'border-transparent'"
          :style="{ background: c }"
          :aria-label="m.color(c)"
          @click="newColor = c"
        />
      </div>
    </form>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">{{ common.actions.close }}</BaseButton>
    </template>
  </BaseDialog>
</template>
