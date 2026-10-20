<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarDays, Copy, Lock } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useCalendarStore, CALENDARS_DIR } from '@/stores/calendars'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { getFs } from '@/services/fs'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Calendari delle scadenze',
    description: 'File .ics nella cartella Dati, aggiornati da soli: aprili in Outlook o Thunderbird e le scadenze compaiono accanto alle riunioni. Nessun server, nessun account.',
    toggle: 'Tieni aggiornati i calendari da questo PC',
    blocked: 'I dati di questo workspace sono cifrati: i calendari sarebbero in chiaro nella cartella condivisa, quindi non si creano.',
    yours: 'Il tuo calendario',
    projects: 'Calendari dei progetti',
    copy: 'Copia il percorso',
    copied: 'Percorso copiato',
    howTo: 'In Outlook: File › Apri ed esporta › Apri calendario, e scegli il file. In Thunderbird: Calendario › Nuovo calendario › In rete, con il percorso del file. Google Calendar importa il file ma non lo aggiorna.',
    error: (e: string) => `Non è stato possibile scrivere i calendari: ${e}`,
  },
  en: {
    title: 'Due-date calendars',
    description: '.ics files in the Data folder, kept up to date: open them in Outlook or Thunderbird and due dates show up next to meetings. No server, no account.',
    toggle: 'Keep the calendars up to date from this PC',
    blocked: 'This workspace’s data is encrypted: the calendars would be in plain text in the shared folder, so they are not created.',
    yours: 'Your calendar',
    projects: 'Project calendars',
    copy: 'Copy the path',
    copied: 'Path copied',
    howTo: 'In Outlook: File › Open & Export › Open Calendar, then pick the file. In Thunderbird: Calendar › New Calendar › On the Network, with the file path. Google Calendar imports the file but does not refresh it.',
    error: (e: string) => `The calendars could not be written: ${e}`,
  },
})

const open = defineModel<boolean>('open', { default: false })
const cal = useCalendarStore()
const ws = useWorkspaceStore()
const ui = useUiStore()

const base = ref('')
watch(
  open,
  async (o) => {
    if (o && ws.storage) base.value = await (await getFs()).join(ws.storage.root, CALENDARS_DIR)
  },
  { immediate: true },
)
const names = computed(() => Object.keys(cal.files))
const personal = computed(() => names.value.filter((n) => n.startsWith('persona-')))
const projects = computed(() => names.value.filter((n) => n.startsWith('progetto-')))
const sep = computed(() => (base.value.includes('\\') ? '\\' : '/'))
const pathOf = (n: string) => `${base.value}${sep.value}${n}`
async function copy(n: string) {
  await navigator.clipboard.writeText(pathOf(n))
  ui.toast(m.copied, 'success', undefined, 1800)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" :description="m.description" width="lg">
    <div class="space-y-4 text-[13px]" data-calendars>
      <p v-if="cal.blocked" class="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-ink-2" data-calendars-blocked><Lock :size="14" class="mt-0.5 shrink-0" /> {{ m.blocked }}</p>
      <template v-else>
        <label class="flex items-center gap-2 font-medium">
          <input type="checkbox" class="accent-accent" :checked="cal.enabled" data-calendars-toggle @change="cal.setEnabled(($event.target as HTMLInputElement).checked)" />
          {{ m.toggle }}
        </label>
        <p v-if="cal.lastError" class="text-danger">{{ m.error(cal.lastError) }}</p>
        <template v-if="cal.enabled">
          <section v-for="group in [{ title: m.yours, list: personal }, { title: m.projects, list: projects }]" :key="group.title">
            <h3 class="mb-1 text-[12px] font-semibold text-ink-3">{{ group.title }}</h3>
            <ul class="divide-y divide-line rounded-md border border-line">
              <li v-for="n in group.list" :key="n" class="flex items-center gap-2 px-3 py-1.5" :data-calendar-file="n">
                <CalendarDays :size="14" class="shrink-0 text-ink-3" />
                <span class="min-w-0 flex-1 truncate font-mono text-[12px]" :title="pathOf(n)">{{ pathOf(n) }}</span>
                <BaseButton size="icon-sm" variant="ghost" :title="m.copy" @click="copy(n)"><Copy :size="13" /></BaseButton>
              </li>
            </ul>
          </section>
          <p class="text-[12px] leading-relaxed text-ink-3">{{ m.howTo }}</p>
        </template>
      </template>
    </div>
  </BaseDialog>
</template>
