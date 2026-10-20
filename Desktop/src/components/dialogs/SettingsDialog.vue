<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { Archive, ArchiveRestore, Bell, Cpu, FolderOpen, Heart, KeyRound, Lock, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-vue-next'
import { useConfirm } from '@/composables/useConfirm'
import { getFs } from '@/services/fs'
import { DONATE_URL } from '@/services/branding'
import VpnSettings from './VpnSettings.vue'
import DomainLoginSettings from './DomainLoginSettings.vue'
import dayjs from 'dayjs'
import RestoreDialog from './RestoreDialog.vue'
import AiSettings from './AiSettings.vue'
import { samePath } from '@/services/projectScan'
import { checkFolder } from '@/services/fsErrors'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore, type Theme } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { saveConfig } from '@/services/config'
import { useNotificationsStore } from '@/stores/notifications'
import { NOTIFICATION_LABEL, NOTIFICATION_TYPES } from '@/types'
import { defineMessages } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    pwUpdated: 'Password aggiornata. Gli altri utenti dovranno reinserirla al prossimo accesso.',
    light: 'Chiaro',
    dark: 'Scuro',
    system: 'Come il sistema',
    title: 'Impostazioni',
    tabGeneral: 'Generali',
    tabUser: 'Dati utente',
    tabNotifications: 'Notifiche',
    tabBackup: 'Backup',
    tabAi: 'IA locale',
    appearance: 'Aspetto',
    displayName: 'Il tuo nome visibile',
    userOn: (u: string, h: string) => `${u} su ${h}`,
    wsName: 'Nome workspace',
    projectsFolder: 'Cartella dei progetti',
    projectsEmpty: 'Non ancora impostata (workspace creato con una versione precedente, senza progetti collegati a una cartella): indicala qui.',
    projectsHint: 'Dove si trovano (o verranno creati) i progetti. Serve a proporre la cartella dei progetti nuovi (<cartella>/<nome>, anche per quelli da GitHub); è quella mostrata nei workspace recenti. Cambiarla non sposta né rinomina i progetti esistenti.',
    pickProjects: 'Scegli la cartella dei progetti',
    dataFolder: 'Cartella Dati Todo Doto',
    dataHint: 'Qui l’app salva i propri dati; per spostarla, copia la cartella e riaprila da «Apri cartella».',
    errSame: 'La cartella dei progetti deve essere diversa dalla cartella Dati Todo Doto.',
    reopenLast: 'All’avvio riapri l’ultimo workspace',
    notifications: 'Notifiche',
    notificationsHint: 'Novità sui progetti di cui fai parte, fatte da altri utenti. Scegli cosa ricevere.',
    backupSection: 'Copie di sicurezza',
    backupEnabled: 'Crea una copia dei dati ogni giorno (in automatico)',
    backupHint: 'Copia i dati di Todo Doto (progetti, task, cartelle, etichette, utenti, cronologia), non i file dei progetti. Si tengono 7 copie giornaliere e 4 settimanali. La fa il primo PC che apre il workspace.',
    backupDir: 'Cartella delle copie',
    backupDirDefault: 'Cartella Dati › backups',
    backupDirHint: 'Meglio un altro disco o un altro server: la copia nella cartella Dati protegge dagli errori, non dai guasti del disco.',
    pickBackupDir: 'Scegli la cartella delle copie',
    backupLast: (when: string, n: number) => `Ultima copia: ${when} · ${n} ${n === 1 ? 'copia' : 'copie'} conservate`,
    backupNone: 'Nessuna copia ancora.',
    backupFailed: (e: string) => `Ultima copia automatica non riuscita: ${e}`,
    backupNow: 'Crea copia ora',
    backupDone: 'Copia creata',
    restore: 'Ripristina…',
    pwSection: 'Password del workspace',
    pwRemembered: 'Ricordata su questo PC, cifrata per il tuo utente Windows: l’accesso avviene senza chiederla.',
    pwNotRemembered: 'Non ricordata su questo PC: ti viene chiesta a ogni apertura del workspace. Per farla ricordare, spunta l’opzione al prossimo accesso.',
    forgetPw: 'Dimentica su questo PC',
    pwForgotten: 'Password rimossa da questo PC: verrà chiesta al prossimo accesso.',
    changePw: 'Cambia password di accesso (amministratore)',
    changePwHint: 'Vale per tutti: gli altri utenti dovranno inserire la nuova password al prossimo accesso.',
    newPw: 'Nuova password',
    repeat: 'Ripeti',
    leaveEmpty: 'Lascia vuoto per non cambiarla.',
    offTitle: 'Lavoro fuori ufficio',
    offLabel: 'Tieni una copia del workspace su questo PC',
    offHint: 'Se la cartella condivisa non si raggiunge (fuori ufficio, VPN spenta) continui a lavorare su task e progetti; al ritorno le modifiche si uniscono a quelle dei colleghi. La copia sta nei dati dell’app su questo PC ed è cifrata come il workspace (altrimenti protetta con l’account Windows).',
    offPending: (n: number) => `${n === 1 ? '1 progetto ha' : `${n} progetti hanno`} modifiche ancora da inviare: la copia resta finché non tornano in rete.`,
    encTitle: 'Cifratura dei dati sul disco',
    encOn: 'Dati cifrati (AES-256): i file nella cartella Dati sono illeggibili senza la password del workspace, anche per chi accede alla cartella con altri programmi.',
    encOff: 'I file nella cartella Dati sono in chiaro: chi accede alla cartella con altri programmi può leggerli.',
    encEnable: 'Cifra i dati',
    encDisable: 'Togli la cifratura',
    encEnableTitle: 'Cifrare i dati del workspace?',
    encEnableMsg: 'Tutti i file della cartella Dati e le prossime copie di sicurezza verranno cifrati con una chiave protetta dalla password del workspace. Gli altri utenti continuano a entrare con la stessa password. Senza la password i dati non si possono recuperare: conservala in un posto sicuro.',
    encDisableTitle: 'Togliere la cifratura?',
    encDisableMsg: 'I file verranno riscritti in chiaro. Le copie di sicurezza già cifrate restano leggibili dall’app.',
    encDone: (on: boolean): string => (on ? 'Dati cifrati' : 'Cifratura tolta'),
    encMember: 'Solo un amministratore può cambiarla.',
    donateTitle: 'Sostieni il progetto',
    donateText: 'Todo Doto è gratuito. Una donazione è ben accetta e supporterà lo sviluppo del progetto.',
    donate: 'Dona con PayPal',
  },
  en: {
    pwUpdated: 'Password updated. Other users will have to enter it again on their next access.',
    light: 'Light',
    dark: 'Dark',
    system: 'Same as system',
    title: 'Settings',
    tabGeneral: 'General',
    tabUser: 'User data',
    tabNotifications: 'Notifications',
    tabBackup: 'Backup',
    tabAi: 'Local AI',
    appearance: 'Appearance',
    displayName: 'Your display name',
    userOn: (u: string, h: string) => `${u} on ${h}`,
    wsName: 'Workspace name',
    projectsFolder: 'Projects folder',
    projectsEmpty: 'Not set yet (workspace created with an earlier version, with no project linked to a folder): set it here.',
    projectsHint: 'Where the projects are (or will be created). It is used to suggest the folder of new projects (<folder>/<name>, GitHub ones too); it is the one shown in the recent workspaces. Changing it does not move or rename existing projects.',
    pickProjects: 'Choose the projects folder',
    dataFolder: 'Todo Doto data folder',
    dataHint: 'This is where the app stores its data; to move it, copy the folder and reopen it with “Open folder”.',
    errSame: 'The projects folder must be different from the Todo Doto data folder.',
    reopenLast: 'Reopen the last workspace on startup',
    notifications: 'Notifications',
    notificationsHint: 'Updates on the projects you belong to, made by other users. Choose what to receive.',
    backupSection: 'Backups',
    backupEnabled: 'Back up the data every day (automatically)',
    backupHint: 'Backs up the Todo Doto data (projects, tasks, folders, labels, users, history), not the project files. 7 daily and 4 weekly backups are kept. The first PC that opens the workspace makes it.',
    backupDir: 'Backup folder',
    backupDirDefault: 'Data folder › backups',
    backupDirHint: 'Another disk or server is better: a backup in the data folder protects against mistakes, not against disk failures.',
    pickBackupDir: 'Choose the backup folder',
    backupLast: (when: string, n: number) => `Last backup: ${when} · ${n} ${n === 1 ? 'backup' : 'backups'} kept`,
    backupNone: 'No backups yet.',
    backupFailed: (e: string) => `Last automatic backup failed: ${e}`,
    backupNow: 'Back up now',
    backupDone: 'Backup created',
    restore: 'Restore…',
    pwSection: 'Workspace password',
    pwRemembered: 'Remembered on this PC, encrypted for your Windows user: you get in without being asked.',
    pwNotRemembered: 'Not remembered on this PC: you are asked for it every time you open the workspace. To have it remembered, tick the option on your next access.',
    forgetPw: 'Forget on this PC',
    pwForgotten: 'Password removed from this PC: it will be asked on the next access.',
    changePw: 'Change access password (administrator)',
    changePwHint: 'Applies to everyone: the other users will have to enter the new password on their next access.',
    newPw: 'New password',
    repeat: 'Repeat',
    leaveEmpty: 'Leave empty to keep it.',
    offTitle: 'Working away from the office',
    offLabel: 'Keep a copy of the workspace on this PC',
    offHint: 'If the shared folder is unreachable (away from the office, VPN off) you keep working on tasks and projects; when you are back the changes are merged with your colleagues’. The copy lives in the app data on this PC and is encrypted like the workspace (otherwise protected with the Windows account).',
    offPending: (n: number) => `${n === 1 ? '1 project has' : `${n} projects have`} changes still to send: the copy stays until they are sent.`,
    encTitle: 'Data encryption on disk',
    encOn: 'Data encrypted (AES-256): the files in the data folder cannot be read without the workspace password, even by whoever opens the folder with other programs.',
    encOff: 'The files in the data folder are not encrypted: whoever opens the folder with other programs can read them.',
    encEnable: 'Encrypt the data',
    encDisable: 'Remove encryption',
    encEnableTitle: 'Encrypt the workspace data?',
    encEnableMsg: 'All the files in the data folder and the next backups will be encrypted with a key protected by the workspace password. The other users keep signing in with the same password. Without the password the data cannot be recovered: keep it somewhere safe.',
    encDisableTitle: 'Remove encryption?',
    encDisableMsg: 'The files will be rewritten unencrypted. Backups that are already encrypted remain readable by the app.',
    encDone: (on: boolean): string => (on ? 'Data encrypted' : 'Encryption removed'),
    encMember: 'Only an administrator can change it.',
    donateTitle: 'Support the project',
    donateText: 'Todo Doto is free. Donations are welcome and will support the development of the project.',
    donate: 'Donate with PayPal',
  },
})

const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const ui = useUiStore()
const session = useSessionStore()
const notif = useNotificationsStore()

const wsName = ref('')
const projectsPath = ref('')
const folderMsg = ref('')
async function pickProjects() {
  const p = await (await getFs()).pickFolder(m.pickProjects)
  if (!p) return
  projectsPath.value = p
  folderMsg.value = (await checkFolder(await getFs(), p)) ?? ''
}
const displayName = ref('')
const pw1 = ref('')
const pw2 = ref('')
const pwMsg = ref('')
const reopenLast = ref(true)
const backupEnabled = ref(true)
const backupDir = ref('')
const backupMsg = ref('')
const showRestore = ref(false)
async function pickBackupDir() {
  const p = await (await getFs()).pickFolder(m.pickBackupDir)
  if (!p) return
  backupDir.value = p
  backupMsg.value = (await checkFolder(await getFs(), p, { write: true })) ?? ''
}
async function backupNow() {
  try {
    await ws.createBackupNow()
    ui.toast(m.backupDone, 'success', undefined, 2500)
  } catch (e) {
    backupMsg.value = e instanceof Error ? e.message : String(e)
  }
}
const lastBackup = computed(() => ws.backups[0] ?? null)

/** Schede: Generali, Dati utente (nomi e password), IA locale (per questo PC), Notifiche, Backup (solo amministratori). */
type Tab = 'general' | 'user' | 'notifications' | 'ai' | 'backup'
const tab = ref<Tab>('general')
const tabs = computed(() => [
  { id: 'general' as Tab, label: m.tabGeneral, icon: SlidersHorizontal },
  { id: 'user' as Tab, label: m.tabUser, icon: UserRound },
  { id: 'ai' as Tab, label: m.tabAi, icon: Cpu },
  { id: 'notifications' as Tab, label: m.tabNotifications, icon: Bell },
  ...(ws.isAdmin ? [{ id: 'backup' as Tab, label: m.tabBackup, icon: Archive }] : []),
])
const aiSettings = ref<InstanceType<typeof AiSettings> | null>(null)

watch(open, (o) => {
  if (!o) return
  // Scheda richiesta da chi apre (es. il banner dell'IA locale), se esiste per questo utente
  tab.value = tabs.value.some((t) => t.id === ui.settingsTab) ? (ui.settingsTab as Tab) : 'general'
  ui.settingsTab = 'general'
  aiSettings.value?.reset()
  wsName.value = ws.meta?.name ?? ''
  // Anche per i workspace che non l'hanno salvata: quella ricavata dalle cartelle dei progetti
  projectsPath.value = ws.projectsRoot
  folderMsg.value = ''
  displayName.value = ws.currentUser?.displayName ?? ''
  pw1.value = pw2.value = pwMsg.value = ''
  reopenLast.value = session.config.reopenLast
  backupEnabled.value = ws.meta?.backup.enabled ?? true
  backupDir.value = ws.meta?.backup.dir ?? ''
  backupMsg.value = ''
  void ws.refreshBackups()
})

async function save() {
  if (ws.isAdmin && wsName.value.trim() && wsName.value.trim() !== ws.meta?.name) await ws.renameWorkspace(wsName.value)
  if (ws.isAdmin && projectsPath.value.trim() !== (ws.meta?.projectsPath ?? '')) {
    if (projectsPath.value.trim() && ws.storage && samePath(projectsPath.value, ws.storage.root)) return ((tab.value = 'general'), (folderMsg.value = m.errSame))
    const problem = await checkFolder(await getFs(), projectsPath.value)
    if (problem) return ((tab.value = 'general'), (folderMsg.value = problem))
    await ws.setProjectsPath(projectsPath.value)
  }
  if (ws.isAdmin && (backupEnabled.value !== ws.meta?.backup.enabled || backupDir.value.trim() !== ws.meta?.backup.dir)) {
    if (backupDir.value.trim()) {
      const problem = await checkFolder(await getFs(), backupDir.value, { write: true })
      if (problem) return ((tab.value = 'backup'), (backupMsg.value = problem))
    }
    await ws.setBackupSettings({ enabled: backupEnabled.value, dir: backupDir.value })
  }
  if (displayName.value.trim() && displayName.value.trim() !== ws.currentUser?.displayName) await ws.renameSelf(displayName.value)
  if (reopenLast.value !== session.config.reopenLast) {
    session.config.reopenLast = reopenLast.value
    await saveConfig(session.config)
  }
  if (aiSettings.value && (await aiSettings.value.apply())) return (tab.value = 'ai')
  if (pw1.value || pw2.value) {
    if (pw1.value.length < 6) return ((tab.value = 'user'), (pwMsg.value = common.password.tooShort))
    if (pw1.value !== pw2.value) return ((tab.value = 'user'), (pwMsg.value = common.password.mismatch))
    await ws.changePassword(pw1.value)
    ui.toast(m.pwUpdated, 'success', undefined, 6000)
  }
  open.value = false
}

async function forgetPw() {
  await ws.forgetCredentials()
  ui.toast(m.pwForgotten, 'info', undefined, 4000)
}

// --- cifratura dei dati (workspace di rete, amministratori) ---------------------------
const confirm = useConfirm()
const encBusy = ref(false)
const encrypted = computed(() => !!ws.meta?.encryption?.enabled)
async function toggleEncryption() {
  const on = !encrypted.value
  const ok = await confirm({ title: on ? m.encEnableTitle : m.encDisableTitle, message: on ? m.encEnableMsg : m.encDisableMsg, confirmLabel: on ? m.encEnable : m.encDisable, danger: !on })
  if (!ok) return
  encBusy.value = true
  try {
    if (await ws.setEncryption(on)) ui.toast(m.encDone(on), 'success', undefined, 3000)
  } finally {
    encBusy.value = false
  }
}
const donate = async () => (await getFs()).openExternal(DONATE_URL, 'link')

const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: m.light },
  { value: 'dark', label: m.dark },
  { value: 'system', label: m.system },
]
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title" width="lg">
    <!-- Schede: Generali, Dati utente, Notifiche, Backup -->
    <div class="-mt-1 mb-4 flex gap-1 border-b border-line" role="tablist" :aria-label="m.title">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        class="-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2 pt-1 text-[13.5px] font-semibold transition-colors"
        :class="tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'"
        :aria-selected="tab === t.id"
        :data-settings-tab="t.id"
        @click="tab = t.id"
      >
        <component :is="t.icon" :size="14" /> {{ t.label }}
      </button>
    </div>

    <!-- Altezza fissa: la finestra non cambia dimensione passando da una scheda all'altra -->
    <div class="-mr-2 h-[min(28rem,calc(100vh-14rem))] overflow-y-auto pr-2" data-settings-body>
    <div v-show="tab === 'general'" class="space-y-5" role="tabpanel" data-settings-panel="general">
      <section>
        <span class="label">{{ m.appearance }}</span>
        <SegmentedControl :model-value="ui.theme" :options="themes" @update:model-value="ui.setTheme" />
      </section>

      <section class="space-y-3">
        <div>
          <label class="label" for="s-projects">{{ m.projectsFolder }}</label>
          <div class="flex gap-2">
            <input id="s-projects" v-model="projectsPath" class="field font-mono text-[12.5px]" :disabled="!ws.isAdmin" />
            <BaseButton v-if="ws.isAdmin" :aria-label="m.pickProjects" @click="pickProjects"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
          </div>
          <p class="mt-1 text-[12px]" :class="folderMsg ? 'text-danger' : 'text-ink-3'">{{ folderMsg || (projectsPath.trim() ? m.projectsHint : m.projectsEmpty) }}</p>
        </div>
        <div>
          <span class="label">{{ m.dataFolder }}</span>
          <p class="truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-[12.5px]" :title="ws.storage?.root" data-data-folder>{{ ws.storage?.root }}</p>
          <p class="mt-1 text-[12px] text-ink-3">{{ m.dataHint }}</p>
        </div>
      </section>

      <label class="flex items-center gap-2 text-[13.5px]">
        <input v-model="reopenLast" type="checkbox" class="accent-accent" />
        {{ m.reopenLast }}
      </label>

      <section class="flex items-start gap-3 rounded-md border border-line px-3 py-2.5" aria-labelledby="s-donate-title" data-donate>
        <Heart :size="16" class="mt-0.5 shrink-0 text-p-immediata" />
        <div class="min-w-0 flex-1">
          <p id="s-donate-title" class="text-[13.5px] font-semibold">{{ m.donateTitle }}</p>
          <p class="text-[12.5px] leading-snug text-ink-2">{{ m.donateText }}</p>
        </div>
        <BaseButton size="sm" variant="primary" class="shrink-0" data-donate-button @click="donate">{{ m.donate }}</BaseButton>
      </section>

    </div>

    <div v-show="tab === 'user'" class="space-y-5" role="tabpanel" data-settings-panel="user">
      <section class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="s-me">{{ m.displayName }}</label>
          <input id="s-me" v-model="displayName" class="field" />
          <p class="mt-1 text-[12px] text-ink-3">{{ m.userOn(session.identity.username, session.identity.hostname) }}</p>
        </div>
        <div>
          <label class="label" for="s-ws">{{ m.wsName }}</label>
          <input id="s-ws" v-model="wsName" class="field" :disabled="!ws.isAdmin" />
        </div>
      </section>

      <section v-if="ws.isNetwork && ws.meta?.auth" aria-labelledby="s-pw-title">
        <span id="s-pw-title" class="label">{{ m.pwSection }}</span>
        <div class="flex items-start gap-3 rounded-md bg-surface-2 px-3 py-2">
          <component :is="ws.passwordRemembered ? KeyRound : Lock" :size="15" class="mt-0.5 shrink-0 text-ink-3" />
          <p class="flex-1 text-[12.5px] leading-snug text-ink-2">{{ ws.passwordRemembered ? m.pwRemembered : m.pwNotRemembered }}</p>
          <BaseButton v-if="ws.passwordRemembered" size="sm" variant="ghost" @click="forgetPw">{{ m.forgetPw }}</BaseButton>
        </div>

        <template v-if="ws.isAdmin">
          <span class="label mt-4">{{ m.changePw }}</span>
          <div class="grid grid-cols-2 gap-3">
            <input v-model="pw1" type="password" class="field" :placeholder="m.newPw" :aria-label="m.newPw" autocomplete="new-password" />
            <input v-model="pw2" type="password" class="field" :placeholder="m.repeat" :aria-label="m.repeat" autocomplete="new-password" />
          </div>
          <p v-if="pwMsg" class="mt-1 text-[13px] text-danger">{{ pwMsg }}</p>
          <p v-else class="mt-1 text-[12px] text-ink-3">{{ m.leaveEmpty }} {{ m.changePwHint }}</p>
        </template>
      </section>

      <section v-if="ws.isNetwork" aria-labelledby="s-off-title" data-offline-setting>
        <span id="s-off-title" class="label">{{ m.offTitle }}</span>
        <label class="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" class="accent-accent" :checked="session.config.offlineCopy" data-offline-toggle @change="ws.setOfflineCopy(($event.target as HTMLInputElement).checked)" />
          {{ m.offLabel }}
        </label>
        <p class="mt-1 text-[12px] leading-snug text-ink-3">{{ m.offHint }}</p>
        <p v-if="ws.offlinePending" class="mt-1 text-[12px] font-medium text-p-media">{{ m.offPending(ws.offlinePending) }}</p>
      </section>

      <VpnSettings v-if="ws.isNetwork" />

      <DomainLoginSettings v-if="ws.isNetwork" />

      <section v-if="ws.isNetwork && ws.meta?.auth" aria-labelledby="s-enc-title" data-encryption>
        <span id="s-enc-title" class="label">{{ m.encTitle }}</span>
        <div class="flex items-start gap-3 rounded-md bg-surface-2 px-3 py-2">
          <component :is="encrypted ? ShieldCheck : Lock" :size="15" class="mt-0.5 shrink-0" :class="encrypted ? 'text-ok' : 'text-ink-3'" />
          <p class="flex-1 text-[12.5px] leading-snug text-ink-2" data-encryption-state>{{ encrypted ? m.encOn : m.encOff }} <span v-if="!ws.isAdmin" class="text-ink-3">{{ m.encMember }}</span></p>
          <BaseButton v-if="ws.isAdmin" size="sm" :variant="encrypted ? 'ghost' : 'primary'" :disabled="encBusy" data-encryption-toggle @click="toggleEncryption">{{ encrypted ? m.encDisable : m.encEnable }}</BaseButton>
        </div>
      </section>
    </div>

    <div v-show="tab === 'notifications'" class="space-y-5" role="tabpanel" data-settings-panel="notifications">
      <section>
        <span class="label">{{ m.notifications }}</span>
        <p class="mb-1.5 text-[12px] text-ink-3">{{ m.notificationsHint }}</p>
        <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <label v-for="t in NOTIFICATION_TYPES" :key="t" class="flex items-center gap-2 text-[13px]">
            <input type="checkbox" class="accent-accent" :checked="notif.isEnabled(t)" @change="notif.setEnabled(t, ($event.target as HTMLInputElement).checked)" />
            {{ NOTIFICATION_LABEL[t] }}
          </label>
        </div>
      </section>

    </div>

    <div v-show="tab === 'ai'" role="tabpanel" data-settings-panel="ai">
      <AiSettings ref="aiSettings" />
    </div>

    <div v-if="ws.isAdmin" v-show="tab === 'backup'" class="space-y-5" role="tabpanel" data-settings-panel="backup">
      <section aria-labelledby="s-backup-title" data-backup-settings>
        <span id="s-backup-title" class="label">{{ m.backupSection }}</span>
        <label class="flex items-center gap-2 text-[13.5px]">
          <input v-model="backupEnabled" type="checkbox" class="accent-accent" />
          {{ m.backupEnabled }}
        </label>
        <p class="mt-1 text-[12px] text-ink-3">{{ m.backupHint }}</p>
        <label class="label mt-3" for="s-backup-dir">{{ m.backupDir }}</label>
        <div class="flex gap-2">
          <input id="s-backup-dir" v-model="backupDir" class="field font-mono text-[12.5px]" :placeholder="m.backupDirDefault" />
          <BaseButton :aria-label="m.pickBackupDir" @click="pickBackupDir"><FolderOpen :size="15" /> {{ common.actions.browse }}</BaseButton>
        </div>
        <p class="mt-1 text-[12px]" :class="backupMsg ? 'text-danger' : 'text-ink-3'">{{ backupMsg || m.backupDirHint }}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
          <p class="min-w-0 flex-1 text-[12.5px]" :class="ws.backupError ? 'text-danger' : 'text-ink-2'" data-backup-status>
            {{ ws.backupError ? m.backupFailed(ws.backupError) : lastBackup ? m.backupLast(dayjs(lastBackup.at).fromNow(), ws.backups.length) : m.backupNone }}
          </p>
          <BaseButton size="sm" variant="ghost" @click="backupNow"><Archive :size="13" /> {{ m.backupNow }}</BaseButton>
          <BaseButton size="sm" variant="ghost" :disabled="!ws.backups.length" @click="showRestore = true"><ArchiveRestore :size="13" /> {{ m.restore }}</BaseButton>
        </div>
      </section>

    </div>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" @click="save">{{ common.actions.save }}</BaseButton>
    </template>
  </BaseDialog>
  <RestoreDialog v-model:open="showRestore" />
</template>
