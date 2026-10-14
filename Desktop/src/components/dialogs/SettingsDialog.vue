<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { FolderOpen, KeyRound, Lock } from 'lucide-vue-next'
import { getFs } from '@/services/fs'
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
    appearance: 'Aspetto',
    displayName: 'Il tuo nome visibile',
    userOn: (u: string, h: string) => `${u} su ${h}`,
    wsName: 'Nome workspace',
    projectsFolder: 'Cartella dei progetti',
    projectsEmpty: 'Non ancora impostata (workspace creato con una versione precedente, senza progetti collegati a una cartella): indicala qui.',
    projectsHint: 'Dove si trovano (o verranno creati) i progetti. Serve a proporre la cartella dei progetti nuovi (<cartella>/<nome>, anche per quelli da GitHub) e a «Crea cartella del progetto» per i progetti senza cartella; è quella mostrata nei workspace recenti. Cambiarla non sposta né rinomina i progetti esistenti.',
    pickProjects: 'Scegli la cartella dei progetti',
    dataFolder: 'Cartella Dati Project Goal Manager',
    dataHint: 'Qui l’app salva i propri dati; per spostarla, copia la cartella e riaprila da «Apri cartella».',
    errSame: 'La cartella dei progetti deve essere diversa dalla cartella Dati Project Goal Manager.',
    reopenLast: 'All’avvio riapri l’ultimo workspace',
    notifications: 'Notifiche',
    notificationsHint: 'Novità sui progetti di cui fai parte, fatte da altri utenti. Scegli cosa ricevere.',
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
  },
  en: {
    pwUpdated: 'Password updated. Other users will have to enter it again on their next access.',
    light: 'Light',
    dark: 'Dark',
    system: 'Same as system',
    title: 'Settings',
    appearance: 'Appearance',
    displayName: 'Your display name',
    userOn: (u: string, h: string) => `${u} on ${h}`,
    wsName: 'Workspace name',
    projectsFolder: 'Projects folder',
    projectsEmpty: 'Not set yet (workspace created with an earlier version, with no project linked to a folder): set it here.',
    projectsHint: 'Where the projects are (or will be created). It is used to suggest the folder of new projects (<folder>/<name>, GitHub ones too) and by “Create project folder” for projects without a folder; it is the one shown in the recent workspaces. Changing it does not move or rename existing projects.',
    pickProjects: 'Choose the projects folder',
    dataFolder: 'Project Goal Manager data folder',
    dataHint: 'This is where the app stores its data; to move it, copy the folder and reopen it with “Open folder”.',
    errSame: 'The projects folder must be different from the Project Goal Manager data folder.',
    reopenLast: 'Reopen the last workspace on startup',
    notifications: 'Notifications',
    notificationsHint: 'Updates on the projects you belong to, made by other users. Choose what to receive.',
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

watch(open, (o) => {
  if (!o) return
  wsName.value = ws.meta?.name ?? ''
  // Anche per i workspace che non l'hanno salvata: quella ricavata dalle cartelle dei progetti
  projectsPath.value = ws.projectsRoot
  folderMsg.value = ''
  displayName.value = ws.currentUser?.displayName ?? ''
  pw1.value = pw2.value = pwMsg.value = ''
  reopenLast.value = session.config.reopenLast
})

async function save() {
  if (ws.isAdmin && wsName.value.trim() && wsName.value.trim() !== ws.meta?.name) await ws.renameWorkspace(wsName.value)
  if (ws.isAdmin && projectsPath.value.trim() !== (ws.meta?.projectsPath ?? '')) {
    if (projectsPath.value.trim() && ws.storage && samePath(projectsPath.value, ws.storage.root)) return (folderMsg.value = m.errSame)
    const problem = await checkFolder(await getFs(), projectsPath.value)
    if (problem) return (folderMsg.value = problem)
    await ws.setProjectsPath(projectsPath.value)
  }
  if (displayName.value.trim() && displayName.value.trim() !== ws.currentUser?.displayName) await ws.renameSelf(displayName.value)
  if (reopenLast.value !== session.config.reopenLast) {
    session.config.reopenLast = reopenLast.value
    await saveConfig(session.config)
  }
  if (pw1.value || pw2.value) {
    if (pw1.value.length < 6) return (pwMsg.value = common.password.tooShort)
    if (pw1.value !== pw2.value) return (pwMsg.value = common.password.mismatch)
    await ws.changePassword(pw1.value)
    ui.toast(m.pwUpdated, 'success', undefined, 6000)
  }
  open.value = false
}

async function forgetPw() {
  await ws.forgetCredentials()
  ui.toast(m.pwForgotten, 'info', undefined, 4000)
}

const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: m.light },
  { value: 'dark', label: m.dark },
  { value: 'system', label: m.system },
]
</script>

<template>
  <BaseDialog v-model:open="open" :title="m.title">
    <div class="space-y-5">
      <section>
        <span class="label">{{ m.appearance }}</span>
        <SegmentedControl :model-value="ui.theme" :options="themes" @update:model-value="ui.setTheme" />
      </section>

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
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" @click="save">{{ common.actions.save }}</BaseButton>
    </template>
  </BaseDialog>
</template>
