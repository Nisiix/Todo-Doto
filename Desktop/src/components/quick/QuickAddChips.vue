<script setup lang="ts">
import dayjs from 'dayjs'
import { CalendarDays, Flag, X } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import LabelBadge from '@/components/board/LabelBadge.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { PRIORITY_LABEL, STATUS_LABEL, type Priority } from '@/types'
import type { QuickAddResult, QuickToken } from '@/services/quickAdd'
import { DATE, defineMessages } from '@/i18n'

const m = defineMessages({
  it: { recognized: 'Riconosciuto:', remove: 'Lascia nel titolo', due: 'Scadenza' },
  en: { recognized: 'Recognized:', remove: 'Keep it in the title', due: 'Due' },
})

/** Ciò che l'inserimento rapido ha riconosciuto nel testo; la X lo lascia nel titolo. */
defineProps<{ parsed: QuickAddResult }>()
const emit = defineEmits<{ remove: [token: QuickToken] }>()
const ws = useWorkspaceStore()
</script>

<template>
  <div v-if="parsed.tokens.length" class="flex flex-wrap items-center gap-1.5 text-[12px]" data-quick-chips>
    <span class="text-ink-3">{{ m.recognized }}</span>
    <span
      v-for="t in parsed.tokens"
      :key="`${t.kind}-${t.start}`"
      class="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2 font-medium text-ink-2"
      :data-quick-chip="t.kind"
    >
      <template v-if="t.kind === 'priority'"><Flag :size="12" class="text-ink-3" /> {{ PRIORITY_LABEL[t.value as Priority] }}</template>
      <template v-else-if="t.kind === 'assignee'"><UserAvatar :name="ws.userName(t.value)" size="xs" /> {{ ws.userName(t.value) }}</template>
      <template v-else-if="t.kind === 'label'"><LabelBadge :label-id="t.value" /></template>
      <template v-else><CalendarDays :size="12" class="text-ink-3" /> {{ m.due }} {{ dayjs(t.value).format(DATE.dayMonth) }} · {{ STATUS_LABEL.confermato }}</template>
      <button type="button" class="-mr-1 rounded-full p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink" :title="m.remove" :aria-label="m.remove" @click="emit('remove', t)">
        <X :size="11" />
      </button>
    </span>
  </div>
</template>
