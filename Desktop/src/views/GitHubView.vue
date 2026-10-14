<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ExternalLink, Loader2, Lock, RefreshCw, Search, Unplug } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import GitHubMark from '@/components/ui/GitHubMark.vue'
import { useGitHubStore } from '@/stores/github'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConfirm } from '@/composables/useConfirm'
import { getFs } from '@/services/fs'
import type { GitHubRepo } from '@/services/github'
import { defineMessages, plural } from '@/i18n'

const m = defineMessages({
  it: {
    lead: 'Collega i repository GitHub ai progetti del workspace: i progetti si creano dai repository e il loro Stack (linguaggi, framework, prerequisiti, passi, README) si sincronizza in automatico.',
    tokenTitle: '1. Crea un token di accesso (una volta sola)',
    tokenStep1: 'Su GitHub apri Impostazioni → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.',
    tokenStep2: 'Scegli i repository (tutti o solo alcuni) e concedi i permessi in sola lettura: Metadata e Contents.',
    tokenStep3: 'Copia il token e incollalo qui: resta cifrato solo su questo PC e non viene mai scritto nel workspace.',
    openTokenPage: 'Apri la pagina dei token',
    token: 'Token di accesso',
    connect: '2. Collega GitHub',
    connecting: 'Verifico il token…',
    disconnect: 'Scollega GitHub',
    disconnectTitle: 'Scollegare GitHub?',
    disconnectMessage: 'Il token viene tolto da questo PC. I progetti restano collegati ai loro repository; per sincronizzarli servirà collegarsi di nuovo.',
    linked: 'Progetti collegati',
    noLinked: 'Nessun progetto collegato: scegli qui sotto i repository da cui creare (o a cui collegare) i progetti.',
    syncedAgo: (when: string) => `sincronizzato ${when}`,
    neverSynced: 'mai sincronizzato',
    sync: 'Sincronizza',
    syncAll: 'Sincronizza tutti',
    syncing: (what: string) => `Sincronizzo… ${what}`,
    autoSync: 'Sincronizza automaticamente all’apertura del workspace (al massimo una volta all’ora)',
    adminOnly: 'Solo gli amministratori possono creare e sincronizzare i progetti da GitHub.',
    repos: 'Repository',
    loadRepos: 'Aggiorna elenco',
    search: 'Cerca un repository',
    reposCount: (n: number) => `${n} ${plural(n, 'repository', 'repository')}`,
    linkedTo: (p: string) => `collegato a «${p}»`,
    archived: 'archiviato',
    fork: 'fork',
    create: (n: number) => `Crea o collega ${n} ${plural(n, 'progetto', 'progetti')}`,
    createHint: 'Ogni progetto prende il nome del repository; se esiste già un progetto con lo stesso nome viene collegato quello. La cartella sul disco è proposta dentro la cartella dei progetti del workspace.',
    importing: (d: number, t: number) => `Creo e sincronizzo i progetti… ${d} di ${t}`,
    selectAll: 'Tutti',
    selectNone: 'Nessuno',
    browserHint: 'Nell’anteprima nel browser le richieste a GitHub partono dal browser.',
  },
  en: {
    lead: 'Link GitHub repositories to the workspace projects: projects are created from the repositories and their Stack (languages, frameworks, prerequisites, steps, README) syncs automatically.',
    tokenTitle: '1. Create an access token (only once)',
    tokenStep1: 'On GitHub open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.',
    tokenStep2: 'Choose the repositories (all or only some) and grant read-only permissions: Metadata and Contents.',
    tokenStep3: 'Copy the token and paste it here: it stays encrypted on this PC only and is never written to the workspace.',
    openTokenPage: 'Open the tokens page',
    token: 'Access token',
    connect: '2. Connect GitHub',
    connecting: 'Checking the token…',
    disconnect: 'Disconnect GitHub',
    disconnectTitle: 'Disconnect GitHub?',
    disconnectMessage: 'The token is removed from this PC. Projects stay linked to their repositories; you will need to connect again to sync them.',
    linked: 'Linked projects',
    noLinked: 'No linked projects: choose below the repositories to create (or link) projects from.',
    syncedAgo: (when: string) => `synced ${when}`,
    neverSynced: 'never synced',
    sync: 'Sync',
    syncAll: 'Sync all',
    syncing: (what: string) => `Syncing… ${what}`,
    autoSync: 'Sync automatically when the workspace opens (at most once an hour)',
    adminOnly: 'Only administrators can create and sync projects from GitHub.',
    repos: 'Repositories',
    loadRepos: 'Refresh list',
    search: 'Search a repository',
    reposCount: (n: number) => `${n} ${plural(n, 'repository', 'repositories')}`,
    linkedTo: (p: string) => `linked to “${p}”`,
    archived: 'archived',
    fork: 'fork',
    create: (n: number) => `Create or link ${n} ${plural(n, 'project', 'projects')}`,
    createHint: 'Each project is named after its repository; if a project with the same name already exists, that one is linked. The disk folder is proposed inside the workspace projects folder.',
    importing: (d: number, t: number) => `Creating and syncing the projects… ${d} of ${t}`,
    selectAll: 'All',
    selectNone: 'None',
    browserHint: 'In the browser preview the requests to GitHub start from the browser.',
  },
})

const gh = useGitHubStore()
const ws = useWorkspaceStore()
const confirm = useConfirm()

const token = ref('')
const connecting = ref(false)
const formError = ref('')
const query = ref('')
const selected = ref(new Set<string>())
const progress = ref('')

onMounted(async () => {
  await gh.init()
  if (gh.connected && !gh.repos.length) await gh.loadRepos()
})

async function connect() {
  formError.value = ''
  connecting.value = true
  try {
    await gh.connect(token.value)
    token.value = ''
    await gh.loadRepos()
  } catch (e) {
    formError.value = e instanceof Error ? e.message : String(e)
  } finally {
    connecting.value = false
  }
}
async function disconnect() {
  if (await confirm({ title: m.disconnectTitle, message: m.disconnectMessage, confirmLabel: m.disconnect })) await gh.disconnect()
}
const openTokenPage = async () => (await getFs()).openExternal('https://github.com/settings/personal-access-tokens/new', 'link')
const openRepo = async (url: string) => (await getFs()).openExternal(url, 'link')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return gh.repos.filter((r) => !q || r.fullName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
})
const key = (r: GitHubRepo) => r.fullName
function toggle(r: GitHubRepo) {
  const next = new Set(selected.value)
  next.has(key(r)) ? next.delete(key(r)) : next.add(key(r))
  selected.value = next
}
const setAll = (on: boolean) => (selected.value = new Set(on ? filtered.value.filter((r) => !gh.projectForRepo(r)).map(key) : []))
const toImport = computed(() => gh.repos.filter((r) => selected.value.has(key(r))))
async function importSelected() {
  progress.value = m.importing(0, toImport.value.length)
  await gh.importRepos(toImport.value, (d, t) => (progress.value = m.importing(d, t)))
  progress.value = ''
  selected.value = new Set()
}
const syncedLabel = (at: string) => (at ? m.syncedAgo(dayjs(at).fromNow()) : m.neverSynced)
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
    <header class="shrink-0 border-b border-line px-8 pb-4 pt-6">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="flex items-center gap-2 text-[24px] font-extrabold leading-tight tracking-tight"><GitHubMark :size="22" /> GitHub</h1>
          <p class="mt-1 max-w-3xl text-[13.5px] text-ink-2">{{ m.lead }}</p>
        </div>
        <template v-if="gh.connected">
          <span class="mt-1 text-[12.5px] text-ink-3">{{ gh.account?.login }}</span>
          <BaseButton size="sm" variant="ghost" :title="m.disconnect" :aria-label="m.disconnect" @click="disconnect"><Unplug :size="14" /></BaseButton>
        </template>
      </div>
    </header>

    <!-- Collegamento -->
    <div v-if="!gh.connected" class="m-8 max-w-xl space-y-4">
      <div class="rounded-lg border border-line bg-surface p-5">
        <h2 class="text-[15px] font-bold">{{ m.tokenTitle }}</h2>
        <ol class="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] text-ink-2">
          <li>{{ m.tokenStep1 }}</li>
          <li>{{ m.tokenStep2 }}</li>
          <li>{{ m.tokenStep3 }}</li>
        </ol>
        <BaseButton class="mt-3" size="sm" @click="openTokenPage"><ExternalLink :size="13" /> {{ m.openTokenPage }}</BaseButton>
      </div>
      <form class="space-y-3" @submit.prevent="connect">
        <div>
          <label class="label" for="gh-token">{{ m.token }}</label>
          <input id="gh-token" v-model="token" type="password" class="field font-mono text-[12.5px]" autocomplete="off" placeholder="github_pat_…" />
        </div>
        <p v-if="formError" class="text-[13px] text-danger">{{ formError }}</p>
        <BaseButton type="submit" variant="primary" :disabled="connecting || !token.trim()">
          <Loader2 v-if="connecting" :size="14" class="animate-spin" /> {{ connecting ? m.connecting : m.connect }}
        </BaseButton>
      </form>
    </div>

    <div v-else class="space-y-8 px-8 py-6">
      <p v-if="!ws.isAdmin" class="max-w-xl rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{{ m.adminOnly }}</p>

      <!-- Progetti collegati -->
      <section class="max-w-4xl">
        <div class="mb-2 flex items-center gap-3">
          <h2 class="flex-1 text-[15px] font-bold">{{ m.linked }} <span class="text-[13px] font-medium text-ink-3">{{ gh.linkedProjects.length || '' }}</span></h2>
          <span v-if="gh.busy" class="flex items-center gap-1.5 text-[12.5px] text-ink-3"><Loader2 :size="12" class="animate-spin" /> {{ m.syncing(gh.busy) }}</span>
          <BaseButton v-if="ws.isAdmin && gh.linkedProjects.length" size="sm" :disabled="!!gh.busy" @click="gh.syncAll()"><RefreshCw :size="13" /> {{ m.syncAll }}</BaseButton>
        </div>
        <label class="mb-2 flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" class="accent-accent" :checked="gh.autoSync" @change="gh.setAutoSync(($event.target as HTMLInputElement).checked)" /> {{ m.autoSync }}
        </label>
        <ul v-if="gh.linkedProjects.length" class="divide-y divide-line rounded-md border border-line">
          <li v-for="p in gh.linkedProjects" :key="p.id" class="flex items-center gap-3 px-3 py-2 text-[13px]">
            <GitHubMark :size="14" class="shrink-0 text-ink-3" />
            <RouterLink :to="{ name: 'project', params: { id: p.id, section: 'stack' } }" class="font-semibold hover:underline">{{ p.name }}</RouterLink>
            <span class="truncate font-mono text-[12px] text-ink-3">{{ p.github!.owner }}/{{ p.github!.repo }}</span>
            <span class="ml-auto shrink-0 text-[12px] text-ink-3">{{ syncedLabel(p.github!.syncedAt) }}</span>
            <BaseButton v-if="ws.isAdmin" size="sm" variant="ghost" :disabled="!!gh.busy" @click="gh.syncProject(p)"><RefreshCw :size="12" /> {{ m.sync }}</BaseButton>
          </li>
        </ul>
        <p v-else class="text-[13px] text-ink-3">{{ m.noLinked }}</p>
      </section>

      <!-- Repository -->
      <section class="max-w-4xl">
        <div class="mb-2 flex flex-wrap items-center gap-3">
          <h2 class="text-[15px] font-bold">{{ m.repos }} <span class="text-[13px] font-medium text-ink-3">{{ gh.repos.length || '' }}</span></h2>
          <div class="relative ml-auto w-64">
            <Search :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input v-model="query" class="field field-sm h-8 pl-8" :placeholder="m.search" />
          </div>
          <BaseButton size="sm" variant="ghost" :disabled="gh.loadingRepos" @click="gh.loadRepos()">
            <Loader2 v-if="gh.loadingRepos" :size="13" class="animate-spin" /><RefreshCw v-else :size="13" /> {{ m.loadRepos }}
          </BaseButton>
        </div>
        <p v-if="gh.error" class="mb-2 text-[13px] text-danger">{{ gh.error }}</p>
        <div v-if="ws.isAdmin && filtered.length" class="mb-1 flex gap-3 text-[12px]">
          <button type="button" class="text-accent-ink hover:underline" @click="setAll(true)">{{ m.selectAll }}</button>
          <button type="button" class="text-accent-ink hover:underline" @click="setAll(false)">{{ m.selectNone }}</button>
        </div>
        <ul class="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-md border border-line">
          <li v-for="r in filtered" :key="r.fullName">
            <label class="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
              <input
                type="checkbox"
                class="accent-accent"
                :checked="selected.has(r.fullName)"
                :disabled="!ws.isAdmin || !!gh.projectForRepo(r)"
                @change="toggle(r)"
              />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <span class="font-semibold">{{ r.name }}</span>
                  <span class="truncate font-mono text-[11.5px] text-ink-3">{{ r.owner }}</span>
                  <Lock v-if="r.private" :size="11" class="shrink-0 text-ink-3" />
                  <span v-if="r.archived" class="rounded-full bg-surface-2 px-1.5 text-[10.5px] text-ink-3">{{ m.archived }}</span>
                  <span v-if="r.fork" class="rounded-full bg-surface-2 px-1.5 text-[10.5px] text-ink-3">{{ m.fork }}</span>
                </span>
                <span v-if="r.description" class="block truncate text-[12px] text-ink-2">{{ r.description }}</span>
              </span>
              <span v-if="r.language" class="shrink-0 text-[11.5px] text-ink-3">{{ r.language }}</span>
              <span v-if="gh.projectForRepo(r)" class="shrink-0 text-[11.5px] font-medium text-ok">{{ m.linkedTo(gh.projectForRepo(r)!.name) }}</span>
              <button type="button" class="shrink-0 rounded p-1 text-ink-3 hover:text-ink" :title="r.htmlUrl" @click.prevent="openRepo(r.htmlUrl)"><ExternalLink :size="12" /></button>
            </label>
          </li>
        </ul>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.reposCount(filtered.length) }}</p>
        <div v-if="ws.isAdmin" class="mt-3 space-y-1.5">
          <BaseButton variant="primary" :disabled="!toImport.length || !!progress" @click="importSelected">
            <Loader2 v-if="progress" :size="14" class="animate-spin" /><GitHubMark v-else :size="14" /> {{ progress || m.create(toImport.length) }}
          </BaseButton>
          <p class="max-w-3xl text-[12px] text-ink-3">{{ m.createHint }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
