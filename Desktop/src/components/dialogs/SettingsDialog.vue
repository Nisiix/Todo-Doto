<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
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
    reopenLast: 'All’avvio riapri l’ultimo workspace',
    notifications: 'Notifiche',
    notificationsHint: 'Novità sui progetti di cui fai parte, fatte da altri utenti. Scegli cosa ricevere.',
    changePw: 'Cambia password di accesso',
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
    reopenLast: 'Reopen the last workspace on startup',
    notifications: 'Notifications',
    notificationsHint: 'Updates on the projects you belong to, made by other users. Choose what to receive.',
    changePw: 'Change access password',
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
})

async function save() {
  if (ws.isAdmin && wsName.value.trim() && wsName.value.trim() !== ws.meta?.name) await ws.renameWorkspace(wsName.value)
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
          <p class="mt-1 truncate font-mono text-[11.5px] text-ink-3" :title="ws.storage?.root">{{ ws.storage?.root }}</p>
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

      <section v-if="ws.isNetwork && ws.isAdmin">
        <span class="label">{{ m.changePw }}</span>
        <div class="grid grid-cols-2 gap-3">
          <input v-model="pw1" type="password" class="field" :placeholder="m.newPw" autocomplete="new-password" />
          <input v-model="pw2" type="password" class="field" :placeholder="m.repeat" autocomplete="new-password" />
        </div>
        <p v-if="pwMsg" class="mt-1 text-[13px] text-danger">{{ pwMsg }}</p>
        <p v-else class="mt-1 text-[12px] text-ink-3">{{ m.leaveEmpty }}</p>
      </section>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ common.actions.cancel }}</BaseButton>
      <BaseButton variant="primary" @click="save">{{ common.actions.save }}</BaseButton>
    </template>
  </BaseDialog>
</template>
