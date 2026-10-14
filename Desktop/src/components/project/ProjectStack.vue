<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, FileDown, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import ChipsInput from '@/components/ui/ChipsInput.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
import { newId } from '@/services/ids'
import { setupScriptWindows } from '@/services/analytics'
import { PLATFORMS, PLATFORM_LABEL, SETUP_STEP_KINDS, SETUP_STEP_LABEL, type Project, type Stack } from '@/types'

/**
 * Sezione "Stack": tecnologie del progetto e configurazione guidata.
 * L'admin compila (linguaggi, framework, repository, cartella, prerequisiti,
 * passi, variabili); gli altri utenti seguono la procedura passo per passo,
 * copiano i comandi o generano uno script che fa tutto in sequenza.
 */
const props = defineProps<{ project: Project; readOnly?: boolean }>()
const ws = useWorkspaceStore()
const ui = useUiStore()

const stack = computed(() => props.project.stack)
const canEdit = computed(() => ws.isAdmin && !props.readOnly)
const editing = ref(false)
const draft = ref<Stack>(clone(stack.value))
function clone(s: Stack): Stack {
  return JSON.parse(JSON.stringify(s)) as Stack
}
watch(stack, (s) => {
  if (!editing.value) draft.value = clone(s)
})
const isEmpty = computed(() => {
  const s = stack.value
  return !s.platforms.length && !s.languages.length && !s.frameworks.length && !s.repoUrl && !s.sourcePath && !s.notes && !s.prerequisites.length && !s.steps.length && !s.envVars.length
})

function startEdit() {
  draft.value = clone(stack.value)
  editing.value = true
}
async function save() {
  const d = draft.value
  d.prerequisites = d.prerequisites.filter((p) => p.name.trim())
  d.steps = d.steps.filter((s) => s.title.trim())
  d.envVars = d.envVars.filter((v) => v.key.trim())
  await ws.updateStack(props.project.id, d)
  editing.value = false
  ui.toast('Stack salvato', 'success', undefined, 1800)
}
function cancel() {
  draft.value = clone(stack.value)
  editing.value = false
}
const togglePlatform = (p: Stack['platforms'][number]) =>
  (draft.value.platforms = draft.value.platforms.includes(p) ? draft.value.platforms.filter((x) => x !== p) : [...draft.value.platforms, p])
const move = <T,>(arr: T[], i: number, dir: -1 | 1) => {
  const j = i + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
}
async function pickSource() {
  const p = await (await getFs()).pickFolder('Cartella del progetto')
  if (p) draft.value.sourcePath = p
}

// --- procedura guidata (stato per utente, sul PC) ---------------------------------
const progressKey = computed(() => `pgm:setup:${props.project.id}:${ws.currentUser?.id ?? 'anon'}`)
const done = ref(new Set<string>())
function loadProgress() {
  try {
    done.value = new Set(JSON.parse(localStorage.getItem(progressKey.value) ?? '[]') as string[])
  } catch {
    done.value = new Set()
  }
}
watch(progressKey, loadProgress, { immediate: true })
function toggleDone(id: string) {
  done.value.has(id) ? done.value.delete(id) : done.value.add(id)
  done.value = new Set(done.value)
  try {
    localStorage.setItem(progressKey.value, JSON.stringify([...done.value]))
  } catch {
    /* solo comodità locale */
  }
}
const totalSteps = computed(() => stack.value.prerequisites.length + stack.value.steps.length)
const doneCount = computed(() => [...stack.value.prerequisites, ...stack.value.steps].filter((x) => done.value.has(x.id)).length)
function resetProgress() {
  done.value = new Set()
  try {
    localStorage.removeItem(progressKey.value)
  } catch {
    /* ignora */
  }
}

async function copy(text: string, what = 'Copiato') {
  try {
    await navigator.clipboard.writeText(text)
    ui.toast(what, 'success', undefined, 1500)
  } catch {
    ui.toast('Copia non riuscita: seleziona e copia il testo a mano.', 'warning')
  }
}
const open = async (target: string, kind: 'file' | 'link') => {
  try {
    await (await getFs()).openExternal(target, kind)
  } catch (e) {
    ui.toast(`Non riesco ad aprire: ${e instanceof Error ? e.message : e}`, 'error')
  }
}
async function downloadScript() {
  const fs = await getFs()
  const name = `setup-${props.project.name.replace(/[^\w-]+/g, '-').toLowerCase()}.cmd`
  const path = await fs.saveFile(name, 'Salva lo script di configurazione')
  if (!path) return
  await fs.writeTextAtomic(path, setupScriptWindows(props.project.name, stack.value))
  ui.toast('Script salvato: aprilo con doppio click per eseguire i passi in sequenza', 'success', { label: 'Apri cartella', run: () => open(path.replace(/[\\/][^\\/]+$/, ''), 'file') }, 6000)
}
</script>

<template>
  <div class="max-w-4xl space-y-8">
    <!-- Intestazione sezione -->
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-[17px] font-bold tracking-tight">Stack e configurazione</h2>
        <p class="mt-0.5 text-[13px] text-ink-2">Con cosa è fatto il progetto e come metterlo in piedi sul proprio PC, passo per passo.</p>
      </div>
      <template v-if="canEdit && !editing">
        <BaseButton size="sm" @click="startEdit"><Pencil :size="14" /> {{ isEmpty ? 'Compila lo stack' : 'Modifica' }}</BaseButton>
      </template>
      <template v-else-if="editing">
        <BaseButton size="sm" variant="ghost" @click="cancel">Annulla</BaseButton>
        <BaseButton size="sm" variant="primary" @click="save">Salva</BaseButton>
      </template>
    </div>

    <!-- ========== MODIFICA (admin) ========== -->
    <form v-if="editing" class="space-y-7" @submit.prevent="save">
      <section class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <span class="label">Tipo di applicazione</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="p in PLATFORMS" :key="p" type="button" class="h-7 rounded-full border px-3 text-[12.5px] font-medium" :class="draft.platforms.includes(p) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2'" :aria-pressed="draft.platforms.includes(p)" @click="togglePlatform(p)">{{ PLATFORM_LABEL[p] }}</button>
          </div>
        </div>
        <div>
          <span class="label">Linguaggi</span>
          <ChipsInput v-model="draft.languages" placeholder="Es. TypeScript, C#, Rust" :suggestions="['TypeScript', 'JavaScript', 'C#', 'Rust', 'Python', 'Java', 'Kotlin', 'Swift', 'Dart', 'SQL', 'PHP', 'Go']" />
        </div>
        <div>
          <span class="label">Framework e librerie</span>
          <ChipsInput v-model="draft.frameworks" placeholder="Es. Vue 3, Tauri, .NET 4.0" :suggestions="['Vue 3', 'Tauri', 'Ionic', 'Capacitor', 'React', 'Angular', 'Electron', '.NET', 'WPF', 'WinForms', 'Flutter', 'Supabase', 'Node.js', 'Express', 'Vite', 'Tailwind CSS']" />
        </div>
        <div>
          <label class="label" for="st-repo">Repository</label>
          <input id="st-repo" v-model="draft.repoUrl" class="field font-mono text-[12.5px]" placeholder="https://github.com/… oppure \\server\git\progetto" />
        </div>
        <div>
          <label class="label" for="st-src">Cartella del progetto (sul PC o in rete)</label>
          <div class="flex gap-2">
            <input id="st-src" v-model="draft.sourcePath" class="field font-mono text-[12.5px]" placeholder="Z:\Progetti\NomeProgetto" />
            <BaseButton @click="pickSource"><FolderOpen :size="15" /> Sfoglia</BaseButton>
          </div>
        </div>
        <div class="md:col-span-2">
          <label class="label" for="st-notes">Note per chi inizia</label>
          <textarea id="st-notes" v-model="draft.notes" class="field min-h-20 resize-y text-[13.5px]" placeholder="Architettura in due righe, cose da sapere, chi contattare…" />
        </div>
      </section>

      <!-- Prerequisiti -->
      <section>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="label mb-0">Prerequisiti da installare</span>
          <BaseButton size="sm" variant="ghost" @click="draft.prerequisites.push({ id: newId('pre'), name: '', version: '', url: '', check: '' })"><Plus :size="14" /> Prerequisito</BaseButton>
        </div>
        <div v-for="(p, i) in draft.prerequisites" :key="p.id" class="mb-2 grid grid-cols-[1fr_6rem_1fr_1fr_auto] items-center gap-2">
          <input v-model="p.name" class="field field-sm" placeholder="Nome, es. Node.js" />
          <input v-model="p.version" class="field field-sm" placeholder="Versione" />
          <input v-model="p.url" class="field field-sm font-mono text-[12px]" placeholder="Dove scaricarlo (URL)" />
          <input v-model="p.check" class="field field-sm font-mono text-[12px]" placeholder="Comando di verifica, es. node -v" />
          <BaseButton size="icon-sm" variant="ghost" title="Rimuovi" @click="draft.prerequisites.splice(i, 1)"><Trash2 :size="14" /></BaseButton>
        </div>
        <p v-if="!draft.prerequisites.length" class="text-[12.5px] text-ink-3">Es. Node.js 20+, Rust, .NET SDK, Visual Studio Build Tools…</p>
      </section>

      <!-- Passi -->
      <section>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="label mb-0">Passi di configurazione, nell'ordine</span>
          <BaseButton size="sm" variant="ghost" @click="draft.steps.push({ id: newId('stp'), title: '', kind: 'command', command: '', cwd: '', url: '', notes: '' })"><Plus :size="14" /> Passo</BaseButton>
        </div>
        <div v-for="(st, i) in draft.steps" :key="st.id" class="mb-2 rounded-md border border-line p-3">
          <div class="grid grid-cols-[2rem_1fr_10rem_auto] items-center gap-2">
            <span class="text-center text-[12px] font-bold text-ink-3">{{ i + 1 }}</span>
            <input v-model="st.title" class="field field-sm" placeholder="Titolo del passo, es. Installa le dipendenze" />
            <select v-model="st.kind" class="field field-sm">
              <option v-for="k in SETUP_STEP_KINDS" :key="k" :value="k">{{ SETUP_STEP_LABEL[k] }}</option>
            </select>
            <span class="flex gap-0.5">
              <BaseButton size="icon-sm" variant="ghost" title="Sposta su" :disabled="i === 0" @click="move(draft.steps, i, -1)"><ArrowUp :size="14" /></BaseButton>
              <BaseButton size="icon-sm" variant="ghost" title="Sposta giù" :disabled="i === draft.steps.length - 1" @click="move(draft.steps, i, 1)"><ArrowDown :size="14" /></BaseButton>
              <BaseButton size="icon-sm" variant="ghost" title="Rimuovi" @click="draft.steps.splice(i, 1)"><Trash2 :size="14" /></BaseButton>
            </span>
          </div>
          <div class="mt-2 grid grid-cols-1 gap-2 pl-10 md:grid-cols-[1fr_14rem]">
            <textarea v-if="st.kind === 'command'" v-model="st.command" class="field field-sm min-h-16 resize-y font-mono text-[12px]" placeholder="Uno o più comandi, uno per riga (es. npm install)" />
            <input v-else-if="st.kind === 'link'" v-model="st.url" class="field field-sm font-mono text-[12px]" placeholder="https://…" />
            <textarea v-else v-model="st.notes" class="field field-sm min-h-16 resize-y" placeholder="Cosa fare a mano" />
            <input v-if="st.kind === 'command'" v-model="st.cwd" class="field field-sm font-mono text-[12px]" placeholder="Cartella (facoltativa)" />
          </div>
          <input v-if="st.kind !== 'manual'" v-model="st.notes" class="field field-sm mt-2 ml-10 w-[calc(100%-2.5rem)]" placeholder="Nota breve (facoltativa)" />
        </div>
        <p v-if="!draft.steps.length" class="text-[12.5px] text-ink-3">Es. 1) clona il repository · 2) npm install · 3) copia .env.example in .env · 4) npm run dev</p>
      </section>

      <!-- Variabili -->
      <section>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="label mb-0">Variabili d'ambiente e configurazioni</span>
          <BaseButton size="sm" variant="ghost" @click="draft.envVars.push({ key: '', example: '', notes: '' })"><Plus :size="14" /> Variabile</BaseButton>
        </div>
        <div v-for="(v, i) in draft.envVars" :key="i" class="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
          <input v-model="v.key" class="field field-sm font-mono text-[12px]" placeholder="NOME_VARIABILE" />
          <input v-model="v.example" class="field field-sm font-mono text-[12px]" placeholder="valore di esempio" />
          <input v-model="v.notes" class="field field-sm" placeholder="A cosa serve / dove si prende" />
          <BaseButton size="icon-sm" variant="ghost" title="Rimuovi" @click="draft.envVars.splice(i, 1)"><Trash2 :size="14" /></BaseButton>
        </div>
      </section>
    </form>

    <!-- ========== LETTURA ========== -->
    <template v-else>
      <div v-if="isEmpty" class="max-w-lg rounded-lg border border-dashed border-line-strong p-5 text-[13.5px] text-ink-2">
        <template v-if="canEdit">Nessuna informazione ancora. Compila lo stack: linguaggi, framework, repository, prerequisiti e i passi per configurare il progetto. Gli altri utenti troveranno qui una procedura guidata.</template>
        <template v-else>L'amministratore non ha ancora descritto lo stack di questo progetto.</template>
      </div>

      <template v-else>
        <!-- Tecnologie -->
        <section class="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
          <div v-if="stack.platforms.length || stack.languages.length || stack.frameworks.length" class="md:col-span-2 space-y-2">
            <div v-if="stack.platforms.length" class="flex flex-wrap items-center gap-1.5 text-[13px]"><span class="w-24 text-ink-3">Tipo</span><span v-for="p in stack.platforms" :key="p" class="rounded-full bg-surface-2 px-2.5 py-0.5 font-medium">{{ PLATFORM_LABEL[p] }}</span></div>
            <div v-if="stack.languages.length" class="flex flex-wrap items-center gap-1.5 text-[13px]"><span class="w-24 text-ink-3">Linguaggi</span><span v-for="l in stack.languages" :key="l" class="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-ink">{{ l }}</span></div>
            <div v-if="stack.frameworks.length" class="flex flex-wrap items-center gap-1.5 text-[13px]"><span class="w-24 text-ink-3">Framework</span><span v-for="f in stack.frameworks" :key="f" class="rounded-full border border-line px-2.5 py-0.5 font-medium">{{ f }}</span></div>
          </div>
          <div v-if="stack.repoUrl" class="text-[13px]">
            <span class="block text-ink-3">Repository</span>
            <span class="flex items-center gap-2"><code class="truncate font-mono text-[12.5px]">{{ stack.repoUrl }}</code><BaseButton size="icon-sm" variant="ghost" title="Copia" @click="copy(stack.repoUrl)"><Copy :size="13" /></BaseButton><BaseButton v-if="/^https?:/.test(stack.repoUrl)" size="icon-sm" variant="ghost" title="Apri" @click="open(stack.repoUrl, 'link')"><ExternalLink :size="13" /></BaseButton></span>
          </div>
          <div v-if="stack.sourcePath" class="text-[13px]">
            <span class="block text-ink-3">Cartella del progetto</span>
            <span class="flex items-center gap-2"><code class="truncate font-mono text-[12.5px]">{{ stack.sourcePath }}</code><BaseButton size="icon-sm" variant="ghost" title="Copia percorso" @click="copy(stack.sourcePath)"><Copy :size="13" /></BaseButton><BaseButton size="icon-sm" variant="ghost" title="Apri cartella" @click="open(stack.sourcePath, 'file')"><FolderOpen :size="13" /></BaseButton></span>
          </div>
          <p v-if="stack.notes" class="md:col-span-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{{ stack.notes }}</p>
        </section>

        <!-- Procedura guidata -->
        <section v-if="totalSteps || stack.envVars.length" class="rounded-lg border border-line bg-surface p-5">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="text-[15px] font-bold">Configura sul tuo PC</h3>
              <p class="text-[12.5px] text-ink-2">Segui i passi nell'ordine e spunta quelli fatti: il progresso è tuo, non si vede agli altri. {{ doneCount }} di {{ totalSteps }} completati.</p>
            </div>
            <BaseButton v-if="doneCount" size="sm" variant="ghost" @click="resetProgress">Ricomincia</BaseButton>
            <BaseButton size="sm" variant="primary" title="Script .cmd che esegue in sequenza verifiche e comandi" @click="downloadScript"><FileDown :size="14" /> Genera script Windows</BaseButton>
          </div>
          <div class="mt-3 h-1.5 rounded-full bg-surface-2"><div class="h-full rounded-full bg-ok transition-[width]" :style="{ width: (totalSteps ? (doneCount / totalSteps) * 100 : 0) + '%' }" /></div>

          <ol class="mt-4 space-y-2">
            <li v-for="p in stack.prerequisites" :key="p.id" class="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2" :class="{ 'opacity-60': done.has(p.id) }">
              <button class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors" :class="done.has(p.id) ? 'border-ok bg-ok text-white' : 'border-line-strong text-transparent hover:border-ok hover:text-ok'" :aria-pressed="done.has(p.id)" :title="done.has(p.id) ? 'Segna come da fare' : 'Segna come fatto'" @click="toggleDone(p.id)"><Check :size="12" stroke-width="3" /></button>
              <div class="min-w-0 flex-1">
                <div class="text-[13.5px] font-semibold">Prerequisito: {{ p.name }} <span v-if="p.version" class="font-normal text-ink-2">{{ p.version }}</span></div>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <code v-if="p.check" class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{{ p.check }}</code>
                  <BaseButton v-if="p.check" size="sm" variant="ghost" @click="copy(p.check, 'Comando copiato')"><Copy :size="12" /> Copia verifica</BaseButton>
                  <BaseButton v-if="p.url" size="sm" variant="ghost" @click="open(p.url, 'link')"><ExternalLink :size="12" /> Scarica</BaseButton>
                </div>
              </div>
            </li>
            <li v-for="(st, i) in stack.steps" :key="st.id" class="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2" :class="{ 'opacity-60': done.has(st.id) }">
              <button class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors" :class="done.has(st.id) ? 'border-ok bg-ok text-white' : 'border-line-strong text-transparent hover:border-ok hover:text-ok'" :aria-pressed="done.has(st.id)" :title="done.has(st.id) ? 'Segna come da fare' : 'Segna come fatto'" @click="toggleDone(st.id)"><Check :size="12" stroke-width="3" /></button>
              <div class="min-w-0 flex-1">
                <div class="text-[13.5px] font-semibold">{{ i + 1 }}. {{ st.title }} <span class="ml-1 rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-ink-2">{{ SETUP_STEP_LABEL[st.kind] }}</span></div>
                <p v-if="st.notes" class="mt-0.5 text-[12.5px] text-ink-2">{{ st.notes }}</p>
                <div v-if="st.kind === 'command' && st.command" class="mt-1.5 flex items-start gap-2">
                  <pre class="min-w-0 flex-1 overflow-x-auto rounded bg-surface-2 px-2 py-1.5 font-mono text-[12px] leading-relaxed">{{ st.cwd ? `cd ${st.cwd}\n` : '' }}{{ st.command }}</pre>
                  <BaseButton size="sm" variant="ghost" @click="copy((st.cwd ? `cd ${st.cwd}\n` : '') + st.command, 'Comando copiato')"><Copy :size="12" /> Copia</BaseButton>
                </div>
                <BaseButton v-else-if="st.kind === 'link' && st.url" size="sm" variant="ghost" class="mt-1" @click="open(st.url, 'link')"><ExternalLink :size="12" /> {{ st.url }}</BaseButton>
              </div>
            </li>
          </ol>

          <div v-if="stack.envVars.length" class="mt-5">
            <h4 class="text-[13px] font-semibold text-ink-2">Variabili d'ambiente e configurazioni</h4>
            <table class="mt-1 w-full text-[12.5px]">
              <tbody class="divide-y divide-line">
                <tr v-for="v in stack.envVars" :key="v.key">
                  <td class="py-1 pr-3 font-mono font-semibold">{{ v.key }}</td>
                  <td class="py-1 pr-3 font-mono text-ink-2">{{ v.example || '—' }}</td>
                  <td class="py-1 text-ink-2">{{ v.notes }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
