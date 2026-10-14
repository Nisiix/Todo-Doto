<script setup lang="ts">
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

/** Elenco delle scorciatoie da tastiera (menu del workspace, oppure tasto ?). */
const open = defineModel<boolean>('open', { default: false })

const groups: { title: string; keys: [string[], string][] }[] = [
  {
    title: 'Ovunque',
    keys: [
      [['Ctrl', 'K'], 'Cerca in tutti i progetti'],
      [['/'], 'Cerca in tutti i progetti'],
      [['Ctrl', 'Shift', 'L'], 'Tema chiaro / scuro'],
      [['?'], 'Questo elenco'],
      [['Esc'], 'Chiude pannello, dialog o ricerca'],
    ],
  },
  {
    title: 'Nel progetto',
    keys: [
      [['N'], 'Nuovo elemento'],
      [['↓'], 'Va alla lista (prima riga)'],
      [['↑', '↓'], 'Scorre gli elementi'],
      [['Invio'], 'Apre l’elemento nel pannello'],
      [['C'], 'Completa (o riapre) l’elemento con il fuoco'],
      [['Canc'], 'Sposta nel cestino l’elemento con il fuoco'],
    ],
  },
  {
    title: 'Nei dialog e nel dettaglio',
    keys: [
      [['Ctrl', 'Invio'], 'Crea l’elemento dal dialog'],
      [['Ctrl', 'S'], 'Salva titolo e descrizione nel dettaglio'],
      [['Invio'], 'Invia commento, domanda o risposta'],
    ],
  },
]
</script>

<template>
  <BaseDialog v-model:open="open" title="Scorciatoie da tastiera" width="sm">
    <div class="space-y-5">
      <section v-for="g in groups" :key="g.title">
        <h3 class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{{ g.title }}</h3>
        <dl class="space-y-1.5">
          <div v-for="([keys, what], i) in g.keys" :key="i" class="flex items-center gap-3 text-[13px]">
            <dt class="flex w-32 shrink-0 gap-1">
              <span v-for="k in keys" :key="k" class="kbd">{{ k }}</span>
            </dt>
            <dd class="text-ink-2">{{ what }}</dd>
          </div>
        </dl>
      </section>
    </div>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">Chiudi</BaseButton>
    </template>
  </BaseDialog>
</template>
