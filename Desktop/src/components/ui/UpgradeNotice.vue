<script setup lang="ts">
import { t } from '@/i18n'
import { Sparkles } from 'lucide-vue-next'
import BaseButton from './BaseButton.vue'
import { useUiStore } from '@/stores/ui'
import { FEATURE_LABEL, PLANS, planFor, type Feature } from '@/services/license'

/** Riquadro «Disponibile nel piano …» al posto di una funzione non inclusa nel piano corrente. */
const props = defineProps<{ feature: Feature; compact?: boolean }>()
const ui = useUiStore()
const plan = PLANS[planFor(props.feature)]
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-md border border-dashed border-line-strong bg-surface-2/50 text-ink-2"
    :class="compact ? 'p-2.5 text-[12.5px]' : 'max-w-xl p-4 text-[13.5px]'"
    role="note"
  >
    <Sparkles :size="compact ? 14 : 18" class="mt-0.5 shrink-0 text-accent" />
    <div class="min-w-0 flex-1">
      <p>
        <b class="text-ink">{{ t(FEATURE_LABEL[feature]) }}</b> {{ t('è inclusa nel piano') }} <b class="text-ink">{{ plan.label }}</b> ({{ plan.price }}).
        <slot />
      </p>
      <BaseButton size="sm" variant="soft" class="mt-2" @click="ui.showLicense = true">{{ t('Vedi piani e licenza') }}</BaseButton>
    </div>
  </div>
</template>
