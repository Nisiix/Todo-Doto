<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, CircleAlert, Download, ExternalLink, Loader2, PlugZap, ShieldCheck, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useAiStore } from '@/stores/ai'
import { getFs } from '@/services/fs'
import { AiError, DEFAULT_BASE_URL, isLocalUrl, probe, RECOMMENDED_EMBED_MODEL, RECOMMENDED_MODEL, type ProbeResult } from '@/services/localAi'
import type { AiConfig, AiProvider } from '@/types'
import { defineMessages, localeTag } from '@/i18n'

const m = defineMessages({
  it: {
    intro: 'Un motore di IA installato su questo PC potenzia Todo Doto: analisi dei progetti più precisa, configurazione più accurata e altre funzioni assistite (task da un testo, task simili, ricerca per significato, riepiloghi).',
    enable: 'Usa l’IA locale su questo PC',
    engine: 'Motore',
    ollama: 'Ollama',
    openai: 'Compatibile OpenAI',
    openaiHint: 'LM Studio, Foundry Local o un altro server compatibile OpenAI avviato su questo PC: scarica e carica il modello dal suo programma.',
    address: 'Indirizzo',
    addressHint: (def: string) => `Vuoto = ${def}. Solo indirizzi di questo PC (127.0.0.1, localhost).`,
    errNotLocal: 'Indirizzo non consentito: l’IA locale si raggiunge solo su questo PC (127.0.0.1 o localhost).',
    model: 'Modello',
    modelHint: (rec: string) => `Consigliato: ${rec} (Qwen 3 4B, gratuito, circa 2,5 GB).`,
    embedModel: 'Modello per le somiglianze',
    embedHint: (rec: string) => `Consigliato: ${rec} (circa 270 MB). Serve per i task simili e la ricerca per significato.`,
    test: 'Prova connessione',
    testing: 'Verifico…',
    connected: (engine: string, n: number) => `${engine} risponde: ${n} ${n === 1 ? 'modello installato' : 'modelli installati'}.`,
    modelReady: (x: string) => `«${x}» pronto.`,
    modelMissing: (x: string) => `«${x}» non è installato.`,
    unreachable: 'Il motore non risponde a questo indirizzo. Installa Ollama (gratuito) e avvialo, oppure controlla l’indirizzo.',
    timeout: 'Il motore non ha risposto in tempo.',
    failed: (e: string) => `Verifica non riuscita: ${e}`,
    getOllama: 'Scarica Ollama',
    download: 'Scarica i modelli mancanti',
    downloading: (x: string) => `Scarico ${x}…`,
    downloadDone: 'Modelli scaricati: l’IA locale è pronta.',
    downloadFailed: (e: string) => `Download non riuscito: ${e}`,
    downloadHint: 'Il download lo esegue Ollama dal proprio catalogo; Todo Doto comunica solo con Ollama su questo PC.',
    cancel: 'Annulla download',
    privacy: 'Tutto resta su questo PC: Todo Doto comunica solo con il motore installato qui, mai con servizi esterni. Al motore arrivano solo i file che l’analisi del progetto legge già (con un limite di dimensione), mai .env, chiavi o credenziali. I suggerimenti vanno sempre confermati.',
  },
  en: {
    intro: 'An AI engine installed on this PC boosts Todo Doto: more precise project analysis, more accurate setup and other assisted features (tasks from a text, similar tasks, search by meaning, summaries).',
    enable: 'Use local AI on this PC',
    engine: 'Engine',
    ollama: 'Ollama',
    openai: 'OpenAI-compatible',
    openaiHint: 'LM Studio, Foundry Local or another OpenAI-compatible server running on this PC: download and load the model from its own app.',
    address: 'Address',
    addressHint: (def: string) => `Empty = ${def}. Only addresses of this PC (127.0.0.1, localhost).`,
    errNotLocal: 'Address not allowed: local AI can only be reached on this PC (127.0.0.1 or localhost).',
    model: 'Model',
    modelHint: (rec: string) => `Recommended: ${rec} (Qwen 3 4B, free, about 2.5 GB).`,
    embedModel: 'Similarity model',
    embedHint: (rec: string) => `Recommended: ${rec} (about 270 MB). Used for similar tasks and search by meaning.`,
    test: 'Test connection',
    testing: 'Checking…',
    connected: (engine: string, n: number) => `${engine} answers: ${n} ${n === 1 ? 'model installed' : 'models installed'}.`,
    modelReady: (x: string) => `“${x}” ready.`,
    modelMissing: (x: string) => `“${x}” is not installed.`,
    unreachable: 'The engine does not answer at this address. Install Ollama (free) and start it, or check the address.',
    timeout: 'The engine did not answer in time.',
    failed: (e: string) => `Check failed: ${e}`,
    getOllama: 'Get Ollama',
    download: 'Download the missing models',
    downloading: (x: string) => `Downloading ${x}…`,
    downloadDone: 'Models downloaded: local AI is ready.',
    downloadFailed: (e: string) => `Download failed: ${e}`,
    downloadHint: 'Ollama downloads them from its own catalog; Todo Doto only talks to Ollama on this PC.',
    cancel: 'Cancel download',
    privacy: 'Everything stays on this PC: Todo Doto only talks to the engine installed here, never to external services. The engine only gets the files the project analysis already reads (size-limited), never .env files, keys or credentials. Suggestions always need your confirmation.',
  },
})

/**
 * Impostazioni › IA locale (per questo PC, per qualunque utente): motore,
 * indirizzo, modelli, prova di connessione e scaricamento dei modelli con
 * Ollama. Le modifiche si applicano con «Salva» del dialog (`apply`).
 */
const ai = useAiStore()

const draft = ref<AiConfig>({ ...ai.config })
const error = ref('')
const result = ref<ProbeResult | null>(null)
const testing = ref(false)
const pullMsg = ref('')

function reset() {
  draft.value = { ...ai.config }
  error.value = ''
  pullMsg.value = ''
  result.value = ai.lastProbe
}

const providers = computed(() => [
  { value: 'ollama' as AiProvider, label: m.ollama },
  { value: 'openai' as AiProvider, label: m.openai },
])
const engineName = computed(() => (draft.value.provider === 'ollama' ? 'Ollama' : m.openai))
const addressOk = computed(() => !draft.value.baseUrl.trim() || isLocalUrl(draft.value.baseUrl))

function explain(r: ProbeResult): string {
  if (r.error === 'not-local') return m.errNotLocal
  if (r.error === 'unreachable') return m.unreachable
  if (r.error === 'timeout') return m.timeout
  return m.failed(r.detail ?? r.error ?? '')
}

async function test() {
  error.value = ''
  if (!addressOk.value) return (error.value = m.errNotLocal)
  testing.value = true
  try {
    result.value = await probe(draft.value)
  } finally {
    testing.value = false
  }
}

const missing = computed(() => {
  const r = result.value
  if (!r?.ok || draft.value.provider !== 'ollama') return []
  return [...(!r.hasModel && draft.value.model.trim() ? [draft.value.model.trim()] : []), ...(!r.hasEmbedModel && draft.value.embedModel.trim() ? [draft.value.embedModel.trim()] : [])]
})
const pct = computed(() => {
  const p = ai.pulling?.progress
  return p && p.total ? Math.min(100, Math.round((p.completed / p.total) * 100)) : null
})
const fmtGb = (n: number) => (n / 1e9).toLocaleString(localeTag, { maximumFractionDigits: 2 })

async function download() {
  pullMsg.value = ''
  try {
    await ai.pull(missing.value, draft.value)
    pullMsg.value = m.downloadDone
  } catch (e) {
    if (!(e instanceof AiError && e.code === 'cancelled')) pullMsg.value = m.downloadFailed(e instanceof Error ? e.message : String(e))
  }
  await test()
}

async function openOllamaSite() {
  await (await getFs()).openExternal('https://ollama.com/download', 'link')
}

/** Applica le modifiche (chiamata da «Salva»). Restituisce un errore da mostrare, o null. */
async function apply(): Promise<string | null> {
  if (!addressOk.value) return (error.value = m.errNotLocal)
  const d = draft.value
  const patch: Partial<AiConfig> = {
    enabled: d.enabled,
    provider: d.provider,
    baseUrl: d.baseUrl.trim(),
    model: d.model.trim() || RECOMMENDED_MODEL,
    embedModel: d.embedModel.trim(),
  }
  const changed = (Object.keys(patch) as (keyof AiConfig)[]).some((k) => patch[k] !== ai.config[k])
  if (changed) {
    await ai.save(patch)
    if (patch.enabled) void ai.check()
  }
  return null
}

defineExpose({ reset, apply })
</script>

<template>
  <div class="space-y-5" data-ai-settings>
    <p class="text-[12.5px] leading-snug text-ink-2">{{ m.intro }}</p>

    <label class="flex items-center gap-2 text-[13.5px] font-medium">
      <input v-model="draft.enabled" type="checkbox" class="accent-accent" data-ai-enabled />
      {{ m.enable }}
    </label>

    <section class="space-y-3">
      <div>
        <span class="label">{{ m.engine }}</span>
        <SegmentedControl v-model="draft.provider" :options="providers" />
        <p v-if="draft.provider === 'openai'" class="mt-1 text-[12px] text-ink-3">{{ m.openaiHint }}</p>
      </div>
      <div>
        <label class="label" for="ai-url">{{ m.address }}</label>
        <input id="ai-url" v-model="draft.baseUrl" class="field font-mono text-[12.5px]" :class="{ '!border-danger': !addressOk }" :placeholder="DEFAULT_BASE_URL[draft.provider]" :aria-invalid="!addressOk" />
        <p class="mt-1 text-[12px]" :class="!addressOk ? 'text-danger' : 'text-ink-3'">{{ !addressOk ? m.errNotLocal : m.addressHint(DEFAULT_BASE_URL[draft.provider]) }}</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="ai-model">{{ m.model }}</label>
          <input id="ai-model" v-model="draft.model" class="field font-mono text-[12.5px]" :placeholder="RECOMMENDED_MODEL" list="ai-models" />
          <p class="mt-1 text-[12px] text-ink-3">{{ m.modelHint(RECOMMENDED_MODEL) }}</p>
        </div>
        <div>
          <label class="label" for="ai-embed">{{ m.embedModel }}</label>
          <input id="ai-embed" v-model="draft.embedModel" class="field font-mono text-[12.5px]" :placeholder="RECOMMENDED_EMBED_MODEL" list="ai-models" />
          <p class="mt-1 text-[12px] text-ink-3">{{ m.embedHint(RECOMMENDED_EMBED_MODEL) }}</p>
        </div>
        <datalist id="ai-models">
          <option v-for="x in result?.models ?? []" :key="x" :value="x" />
        </datalist>
      </div>
    </section>

    <!-- Prova di connessione ed esito -->
    <section class="space-y-2 rounded-md bg-surface-2 px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <BaseButton size="sm" :disabled="testing || !!ai.pulling" data-ai-test @click="test">
          <Loader2 v-if="testing" :size="13" class="animate-spin" /><PlugZap v-else :size="13" /> {{ testing ? m.testing : m.test }}
        </BaseButton>
        <BaseButton v-if="draft.provider === 'ollama' && result && !result.ok" size="sm" variant="ghost" @click="openOllamaSite"><ExternalLink :size="13" /> {{ m.getOllama }}</BaseButton>
        <BaseButton v-if="missing.length && !ai.pulling" size="sm" variant="primary" data-ai-download @click="download"><Download :size="13" /> {{ m.download }}</BaseButton>
      </div>
      <p v-if="error" class="text-[12.5px] text-danger">{{ error }}</p>
      <div v-else-if="result" class="space-y-0.5 text-[12.5px]" data-ai-status>
        <template v-if="result.ok">
          <p class="flex items-center gap-1.5 text-ink-2"><CheckCircle2 :size="13" class="shrink-0 text-ok" /> {{ m.connected(engineName, result.models.length) }}</p>
          <p v-if="draft.model" class="flex items-center gap-1.5" :class="result.hasModel ? 'text-ink-2' : 'text-warn'">
            <component :is="result.hasModel ? CheckCircle2 : CircleAlert" :size="13" class="shrink-0" :class="result.hasModel ? 'text-ok' : ''" />
            {{ result.hasModel ? m.modelReady(draft.model) : m.modelMissing(draft.model) }}
          </p>
          <p v-if="draft.embedModel" class="flex items-center gap-1.5" :class="result.hasEmbedModel ? 'text-ink-2' : 'text-ink-3'">
            <component :is="result.hasEmbedModel ? CheckCircle2 : CircleAlert" :size="13" class="shrink-0" :class="result.hasEmbedModel ? 'text-ok' : ''" />
            {{ result.hasEmbedModel ? m.modelReady(draft.embedModel) : m.modelMissing(draft.embedModel) }}
          </p>
        </template>
        <p v-else class="flex items-start gap-1.5 text-danger"><CircleAlert :size="13" class="mt-0.5 shrink-0" /> {{ explain(result) }}</p>
      </div>
      <!-- Download in corso -->
      <div v-if="ai.pulling" class="space-y-1" data-ai-pulling>
        <div class="flex items-center gap-2 text-[12.5px] text-ink-2">
          <Loader2 :size="13" class="animate-spin" />
          <span class="flex-1">{{ m.downloading(ai.pulling.model) }} <span v-if="pct !== null">{{ pct }}% · {{ fmtGb(ai.pulling.progress.completed) }} / {{ fmtGb(ai.pulling.progress.total) }} GB</span></span>
          <BaseButton size="icon-sm" variant="ghost" :title="m.cancel" :aria-label="m.cancel" @click="ai.cancelPull"><X :size="13" /></BaseButton>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" :aria-valuenow="pct ?? undefined" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full bg-accent transition-[width]" :class="{ 'animate-pulse': pct === null }" :style="{ width: `${pct ?? 15}%` }" />
        </div>
        <p class="text-[11.5px] text-ink-3">{{ m.downloadHint }}</p>
      </div>
      <p v-if="pullMsg" class="text-[12.5px] text-ink-2" data-ai-pull-msg>{{ pullMsg }}</p>
    </section>

    <p class="flex items-start gap-2 text-[12px] leading-snug text-ink-3"><ShieldCheck :size="14" class="mt-0.5 shrink-0" /> {{ m.privacy }}</p>
  </div>
</template>
