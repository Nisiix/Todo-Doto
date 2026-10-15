<script setup lang="ts">
import { t, tn } from '@/i18n'
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { BadgeCheck, Bug, DatabaseBackup, ExternalLink, RefreshCw, RotateCcw, Sparkles } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import UpgradeNotice from '@/components/ui/UpgradeNotice.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore, type Theme } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { useUpdatesStore } from '@/stores/updates'
import { saveConfig } from '@/services/config'
import { useNotificationsStore } from '@/stores/notifications'
import { useConfirm } from '@/composables/useConfirm'
import { getFs, isTauri } from '@/services/fs'
import { APP_NAME, APP_VERSION, BUILD_DATE, GUIDE_URL } from '@/services/branding'
import { buildReportMailto } from '@/services/diagnostics'
import { describePlan, seatsLabel } from '@/services/license'
import { LOCALES, type Locale } from '@/i18n'
import { NOTIFICATION_LABEL, NOTIFICATION_TYPES } from '@/types'

const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const session = useSessionStore()
const notif = useNotificationsStore()
const updates = useUpdatesStore()
const confirm = useConfirm()

const wsName = ref('')
const displayName = ref('')
const pw1 = ref('')
const pw2 = ref('')
const pwMsg = ref('')
const reopenLast = ref(true)

watch(open, (o) => {
  if (!o) return
  wsName.value = ws.meta?.name ?? ''
  displayName.value = ws.currentUser?.displayName ?? ''
  pw1.value = pw2.value = pwMsg.value = ''
  reopenLast.value = session.config.reopenLast
  void ws.refreshBackups()
})

async function save() {
  if (ws.isAdmin && wsName.value.trim() && wsName.value.trim() !== ws.meta?.name) await ws.renameWorkspace(wsName.value)
  if (displayName.value.trim() && displayName.value.trim() !== ws.currentUser?.displayName) await ws.renameSelf(displayName.value)
  if (reopenLast.value !== session.config.reopenLast) {
    session.config.reopenLast = reopenLast.value
    await saveConfig(session.config)
  }
  if (pw1.value || pw2.value) {
    if (pw1.value.length < 6) return (pwMsg.value = t('La password deve avere almeno 6 caratteri.'))
    if (pw1.value !== pw2.value) return (pwMsg.value = t('Le due password non coincidono.'))
    await ws.changePassword(pw1.value)
    ui.toast(t('Password aggiornata. Gli altri utenti dovranno reinserirla al prossimo accesso.'), 'success', undefined, 6000)
  }
  open.value = false
}

const languages = computed<{ value: 'system' | Locale; label: string }[]>(() => [{ value: 'system', label: t('Come il sistema') }, ...LOCALES])
const languageValue = computed(() => session.config.locale ?? 'system')
async function setLanguage(v: 'system' | Locale) {
  session.config.locale = v === 'system' ? null : v
  await saveConfig(session.config)
  window.location.reload()
}

const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: t('Chiaro') },
  { value: 'dark', label: t('Scuro') },
  { value: 'system', label: t('Come il sistema') },
]

async function toggleDesktop(enabled: boolean) {
  const ok = await notif.setDesktop(enabled)
  if (enabled && !ok) ui.toast(t('Windows non ha concesso il permesso per le notifiche: controlla Impostazioni → Sistema → Notifiche.'), 'warning', undefined, 7000)
}

// --- backup ---------------------------------------------------------------
const backupLabel = (name: string) => dayjs(name.replace('_', 'T').replace(/(\d{2})(\d{2})$/, '$1:$2')).format('D MMM YYYY, HH:mm')
async function restore(name: string) {
  const ok = await confirm({
    title: t('Ripristinare lo snapshot del {date}?', { date: backupLabel(name) }),
    message: t('I file correnti del workspace vengono sostituiti con quelli dello snapshot, per tutti i membri. Prima del ripristino viene creato uno snapshot dello stato attuale.'),
    confirmLabel: t('Ripristina'),
    danger: true,
  })
  if (!ok) return
  await ws.createBackupNow()
  if (await ws.restoreBackup(name)) ui.toast(t('Workspace ripristinato'), 'success')
}
async function snapshotNow() {
  const n = await ws.createBackupNow()
  if (n) ui.toast(t('Snapshot creato'), 'success')
}

// --- informazioni e aggiornamenti -----------------------------------------
const updateLine = computed(() => {
  switch (updates.status) {
    case 'checking':
      return 'Controllo in corso…'
    case 'none':
      return `Hai la versione più recente (controllato ${dayjs(updates.checkedAt).format('HH:mm')}).`
    case 'available':
      return `Disponibile la versione ${updates.update?.version}${updates.update?.date ? ` del ${dayjs(updates.update.date).format('D MMM YYYY')}` : ''}.`
    case 'installing':
      return `Installazione… ${Math.round(updates.progress * 100)}%`
    case 'error':
      return `Controllo non riuscito: ${updates.error}`
    default:
      return isTauri ? 'Gli aggiornamenti vengono controllati all’avvio.' : 'Disponibile solo nell’app desktop.'
  }
})

async function report() {
  const href = await buildReportMailto({
    workspaceMode: ws.meta?.mode ?? null,
    plan: ws.plan.plan,
    users: ws.users.length,
    projects: Object.keys(ws.projects).length,
  })
  const fs = await getFs()
  await fs.openExternal(href, 'link')
}
const openGuide = async () => (await getFs()).openExternal(GUIDE_URL, 'link')
</script>

<template>
  <BaseDialog v-model:open="open" :title="t('Impostazioni')" width="lg">
    <div class="space-y-5">
      <section class="grid grid-cols-2 gap-3">
        <div>
          <span class="label">{{ t('Aspetto') }}</span>
          <SegmentedControl :model-value="ui.theme" :options="themes" @update:model-value="ui.setTheme" />
        </div>
        <div>
          <span class="label">{{ t('Lingua') }}</span>
          <SegmentedControl :model-value="languageValue" :options="languages" @update:model-value="setLanguage" />
          <p class="mt-1 text-[12px] text-ink-3">{{ t('Cambiando lingua l’app si ricarica.') }}</p>
        </div>
      </section>

      <section class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="s-me">{{ t('Il tuo nome visibile') }}</label>
          <input id="s-me" v-model="displayName" class="field" />
          <p class="mt-1 text-[12px] text-ink-3">{{ t('{user} su {host}', { user: session.identity.username, host: session.identity.hostname }) }}</p>
        </div>
        <div>
          <label class="label" for="s-ws">{{ t('Nome workspace') }}</label>
          <input id="s-ws" v-model="wsName" class="field" :disabled="!ws.isAdmin" />
          <p class="mt-1 truncate font-mono text-[11.5px] text-ink-3" :title="ws.storage?.root">{{ ws.storage?.root }}</p>
        </div>
      </section>

      <label class="flex items-center gap-2 text-[13.5px]">
        <input v-model="reopenLast" type="checkbox" class="accent-accent" />
        {{ t('All\'avvio riapri l\'ultimo workspace') }}
      </label>

      <section>
        <span class="label">{{ t('Piano e licenza') }}</span>
        <div class="flex items-center gap-3 rounded-md border border-line p-3">
          <BadgeCheck :size="18" class="shrink-0" :class="ws.plan.source === 'free' ? 'text-ink-3' : 'text-accent'" />
          <span class="min-w-0 flex-1 text-[13.5px]">{{ describePlan(ws.plan) }}<template v-if="ws.isNetwork"> · {{ tn(ws.users.length, '1 membro', '{n} membri') }}, {{ seatsLabel(ws.plan.seats) }}</template></span>
          <BaseButton size="sm" @click="ui.showLicense = true">{{ t('Gestisci') }}</BaseButton>
        </div>
      </section>

      <section>
        <span class="label">{{ t('Notifiche') }}</span>
        <p class="mb-1.5 text-[12px] text-ink-3">{{ t('Novità sui progetti di cui fai parte, fatte da altri utenti. Scegli cosa ricevere.') }}</p>
        <label class="mb-2 flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" class="accent-accent" :checked="session.config.desktopNotifications" :disabled="!isTauri" @change="toggleDesktop(($event.target as HTMLInputElement).checked)" />
          {{ t('Mostra anche le notifiche di Windows') }}
          <span v-if="!isTauri" class="text-[12px] text-ink-3">{{ t('(solo nell’app desktop)') }}</span>
        </label>
        <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <label v-for="type in NOTIFICATION_TYPES" :key="type" class="flex items-center gap-2 text-[13px]">
            <input type="checkbox" class="accent-accent" :checked="notif.isEnabled(type)" @change="notif.setEnabled(type, ($event.target as HTMLInputElement).checked)" />
            {{ t(NOTIFICATION_LABEL[type]) }}
          </label>
        </div>
      </section>

      <section>
        <span class="label">{{ t('Backup') }}</span>
        <UpgradeNotice v-if="!ws.can('backup')" feature="backup" compact>{{ t('Uno snapshot al giorno dei file del workspace, con ripristino in un click.') }}</UpgradeNotice>
        <template v-else>
          <p class="mb-1.5 text-[12px] text-ink-3">{{ t('Uno snapshot al giorno in') }} <code>{{ t('_backup/') }}</code> {{ t('dentro la cartella del workspace (ne restano 14). Il ripristino è riservato agli amministratori.') }}</p>
          <div class="flex items-center gap-2">
            <BaseButton size="sm" @click="snapshotNow"><DatabaseBackup :size="13" /> {{ t('Crea snapshot ora') }}</BaseButton>
            <span class="text-[12px] text-ink-3">{{ ws.backups.length ? t('{n} snapshot', { n: ws.backups.length }) : t('Nessuno snapshot ancora') }}</span>
          </div>
          <ul v-if="ws.backups.length" class="mt-2 max-h-36 divide-y divide-line overflow-y-auto rounded-md border border-line">
            <li v-for="b in ws.backups" :key="b" class="flex items-center gap-2 px-2.5 py-1.5 text-[13px]">
              <span class="flex-1 tabular-nums">{{ backupLabel(b) }}</span>
              <BaseButton v-if="ws.isAdmin" size="sm" variant="ghost" @click="restore(b)"><RotateCcw :size="12" /> {{ t('Ripristina') }}</BaseButton>
            </li>
          </ul>
        </template>
      </section>

      <section v-if="ws.isNetwork && ws.isAdmin">
        <span class="label">{{ t('Cambia password di accesso') }}</span>
        <div class="grid grid-cols-2 gap-3">
          <input v-model="pw1" type="password" class="field" :placeholder="t('Nuova password')" autocomplete="new-password" />
          <input v-model="pw2" type="password" class="field" :placeholder="t('Ripeti')" autocomplete="new-password" />
        </div>
        <p v-if="pwMsg" class="mt-1 text-[13px] text-danger">{{ pwMsg }}</p>
        <p v-else class="mt-1 text-[12px] text-ink-3">{{ t('Lascia vuoto per non cambiarla.') }}</p>
      </section>

      <section>
        <span class="label">{{ t('Informazioni') }}</span>
        <p class="text-[13.5px]">{{ APP_NAME }} <b>{{ APP_VERSION }}</b> <span class="text-[12px] text-ink-3">· build del {{ dayjs(BUILD_DATE).format('D MMM YYYY') }}</span></p>
        <p class="mt-1 text-[12.5px] text-ink-2">{{ updateLine }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <BaseButton v-if="updates.status === 'available'" size="sm" variant="primary" @click="updates.install()">{{ t('Installa e riavvia') }}</BaseButton>
          <BaseButton size="sm" :disabled="updates.status === 'checking' || updates.status === 'installing' || !isTauri" @click="updates.check(false)"><RefreshCw :size="13" /> {{ t('Controlla aggiornamenti') }}</BaseButton>
          <BaseButton size="sm" @click="ui.showWhatsNew = true"><Sparkles :size="13" /> {{ t('Novità') }}</BaseButton>
          <BaseButton size="sm" @click="openGuide"><ExternalLink :size="13" /> {{ t('Guida') }}</BaseButton>
          <BaseButton size="sm" @click="report"><Bug :size="13" /> {{ t('Segnala un problema') }}</BaseButton>
        </div>
      </section>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ t('Annulla') }}</BaseButton>
      <BaseButton variant="primary" @click="save">{{ t('Salva') }}</BaseButton>
    </template>
  </BaseDialog>
</template>
