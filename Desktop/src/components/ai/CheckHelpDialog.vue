<script setup lang="ts">
import { ref, watch } from 'vue'
import { Copy, Loader2 } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { withAi } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { explainCheck, type CheckHelp, type CheckHelpInput } from '@/services/aiAssist'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    title: (n: string) => `Come sistemare ${n}`,
    lead: 'Spiegazione ricavata dall’esito della verifica su questo PC. I comandi non vengono eseguiti: copiali se ti servono.',
    thinking: 'Analizzo l’esito della verifica…',
    failed: 'Non è stato possibile ottenere una spiegazione adesso. Controlla l’IA locale nelle Impostazioni.',
    steps: 'Cosa fare',
    commands: 'Comandi utili',
    copied: 'Comando copiato',
  },
  en: {
    title: (n: string) => `How to fix ${n}`,
    lead: 'Explanation based on the check result on this PC. Commands are not run: copy them if you need them.',
    thinking: 'Analyzing the check result…',
    failed: 'Could not get an explanation right now. Check the local AI in Settings.',
    steps: 'What to do',
    commands: 'Useful commands',
    copied: 'Command copied',
  },
})

/** Spiegazione (IA locale) di una verifica di prerequisito non riuscita, con i passi per sistemarla. */
const props = defineProps<{ input: CheckHelpInput | null }>()
const open = defineModel<boolean>('open', { default: false })
const ui = useUiStore()
const help = ref<CheckHelp | null>(null)
const loading = ref(false)
const failed = ref(false)

watch(open, async (o) => {
  if (!o || !props.input) return
  help.value = null
  failed.value = false
  loading.value = true
  const input = props.input
  const r = await withAi((cfg) => explainCheck(cfg, input))
  loading.value = false
  if (r) help.value = r
  else failed.value = true
})

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ui.toast(m.copied, 'success', undefined, 1500)
  } catch {
    /* appunti non disponibili */
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title(input?.name ?? '')" :description="m.lead">
    <div class="space-y-4 text-[13.5px]" data-check-help>
      <p v-if="loading" class="flex items-center gap-2 text-ink-2"><Loader2 :size="14" class="animate-spin" /> {{ m.thinking }}</p>
      <p v-else-if="failed" class="text-danger">{{ m.failed }}</p>
      <template v-else-if="help">
        <p class="leading-relaxed text-ink">{{ help.summary }}</p>
        <section v-if="help.steps.length">
          <h3 class="label">{{ m.steps }}</h3>
          <ol class="list-decimal space-y-1 pl-5 text-ink-2">
            <li v-for="(s, i) in help.steps" :key="i">{{ s }}</li>
          </ol>
        </section>
        <section v-if="help.commands.length">
          <h3 class="label">{{ m.commands }}</h3>
          <div v-for="(c, i) in help.commands" :key="i" class="mb-1.5 flex items-start gap-2">
            <pre class="min-w-0 flex-1 overflow-x-auto rounded bg-surface-2 px-2 py-1.5 font-mono text-[12px]">{{ c }}</pre>
            <BaseButton size="sm" variant="ghost" @click="copy(c)"><Copy :size="12" /> {{ common.actions.copy }}</BaseButton>
          </div>
        </section>
      </template>
    </div>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">{{ common.actions.close }}</BaseButton>
    </template>
  </BaseDialog>
</template>
