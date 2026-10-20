<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Building2 } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import ChipsInput from '@/components/ui/ChipsInput.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Accesso aziendale (account di dominio)',
    enable: 'Riconosci gli utenti dall’account di dominio',
    hint: 'Chi accede con l’account aziendale di Windows (Active Directory o Microsoft Entra ID) è lo stesso utente su qualunque PC. La password del workspace resta: protegge i dati.',
    account: (a: string) => `Su questo PC: ${a}`,
    noDomain: 'Su questo PC l’accesso a Windows è con un account locale, non di dominio.',
    groupsTitle: 'Ruoli dai gruppi di Active Directory (facoltativo)',
    groupsHint: 'Se indichi dei gruppi, il ruolo di ognuno si aggiorna da solo quando apre il workspace. Vuoto = ruoli assegnati a mano. Nome del gruppo con o senza dominio (es. STUDIO\\TodoDoto-Admin).',
    adminGroups: 'Gruppi degli amministratori',
    cleanerGroups: 'Gruppi dei Cleaner',
    placeholder: 'Nome del gruppo e Invio',
    myGroups: (n: number) => `I tuoi gruppi (${n})`,
    save: 'Salva',
    saved: 'Accesso aziendale salvato.',
    errNoDomain: 'Per attivarlo serve un account di dominio su questo PC.',
    errNotInAdmin: 'Non fai parte di nessuno dei gruppi degli amministratori indicati: perderesti il ruolo. Aggiungi un tuo gruppo.',
    errFailed: 'Salvataggio non riuscito.',
    on: 'Attivo: gli utenti si riconoscono dall’account di dominio.',
    off: 'Non attivo: gli utenti si riconoscono da nome utente e PC.',
    adminOnly: 'Lo cambia un amministratore.',
  },
  en: {
    title: 'Company sign-in (domain account)',
    enable: 'Recognize users by their domain account',
    hint: 'Whoever signs in to Windows with the company account (Active Directory or Microsoft Entra ID) is the same user on any PC. The workspace password stays: it protects the data.',
    account: (a: string) => `On this PC: ${a}`,
    noDomain: 'On this PC Windows is signed in with a local account, not a domain one.',
    groupsTitle: 'Roles from Active Directory groups (optional)',
    groupsHint: 'If you list groups, everyone’s role updates by itself when they open the workspace. Empty = roles assigned by hand. Group name with or without domain (e.g. STUDIO\\TodoDoto-Admin).',
    adminGroups: 'Administrator groups',
    cleanerGroups: 'Cleaner groups',
    placeholder: 'Group name and Enter',
    myGroups: (n: number) => `Your groups (${n})`,
    save: 'Save',
    saved: 'Company sign-in saved.',
    errNoDomain: 'A domain account on this PC is needed to turn it on.',
    errNotInAdmin: 'You are not in any of the administrator groups listed: you would lose the role. Add one of your groups.',
    errFailed: 'Saving failed.',
    on: 'On: users are recognized by their domain account.',
    off: 'Off: users are recognized by user name and PC.',
    adminOnly: 'An administrator changes it.',
  },
})

/** Impostazioni › Dati utente (workspace di rete): accesso con l'account di dominio e ruoli dai gruppi. */
const ws = useWorkspaceStore()
const session = useSessionStore()
const ui = useUiStore()

const enabled = ref(false)
const adminGroups = ref<string[]>([])
const cleanerGroups = ref<string[]>([])
watch(
  () => ws.meta?.domainLogin,
  (d) => {
    enabled.value = !!d?.enabled
    adminGroups.value = [...(d?.adminGroups ?? [])]
    cleanerGroups.value = [...(d?.cleanerGroups ?? [])]
  },
  { immediate: true },
)
const id = computed(() => session.identity)
const account = computed(() => (id.value.sid && id.value.domain ? `${id.value.domain}\\${id.value.username}` : ''))
const dirty = computed(() => {
  const d = ws.meta?.domainLogin
  return !!d && (d.enabled !== enabled.value || d.adminGroups.join('|') !== adminGroups.value.join('|') || d.cleanerGroups.join('|') !== cleanerGroups.value.join('|'))
})

async function save() {
  const r = await ws.setDomainLogin({ enabled: enabled.value, adminGroups: adminGroups.value, cleanerGroups: cleanerGroups.value })
  if (r === 'ok') ui.toast(m.saved, 'success')
  else ui.toast(r === 'noDomain' ? m.errNoDomain : r === 'notInAdminGroup' ? m.errNotInAdmin : m.errFailed, 'warning', undefined, 8000)
}
</script>

<template>
  <section aria-labelledby="s-domain-title" data-domain-login>
    <span id="s-domain-title" class="label">{{ m.title }}</span>
    <p class="mb-1.5 flex items-center gap-1.5 text-[12px] text-ink-2"><Building2 :size="13" class="shrink-0" /> {{ account ? m.account(account) : m.noDomain }}</p>
    <template v-if="ws.isAdmin">
      <label class="flex items-center gap-2 text-[13.5px]">
        <input v-model="enabled" type="checkbox" class="accent-accent" :disabled="!account && !enabled" data-domain-toggle />
        {{ m.enable }}
      </label>
      <p class="mt-1 text-[12px] leading-snug text-ink-3">{{ m.hint }}</p>
      <div v-if="enabled" class="mt-3 space-y-2 rounded-md bg-surface-2 px-3 py-2.5">
        <p class="text-[12.5px] font-medium">{{ m.groupsTitle }}</p>
        <p class="text-[12px] leading-snug text-ink-3">{{ m.groupsHint }}</p>
        <div>
          <span class="mb-1 block text-[12px] text-ink-2">{{ m.adminGroups }}</span>
          <ChipsInput v-model="adminGroups" :placeholder="m.placeholder" data-domain-admin-groups />
        </div>
        <div>
          <span class="mb-1 block text-[12px] text-ink-2">{{ m.cleanerGroups }}</span>
          <ChipsInput v-model="cleanerGroups" :placeholder="m.placeholder" />
        </div>
        <details v-if="id.groups?.length" class="text-[12px] text-ink-3">
          <summary class="cursor-pointer">{{ m.myGroups(id.groups.length) }}</summary>
          <p class="mt-1 break-words font-mono text-[11.5px]">{{ id.groups.join(' · ') }}</p>
        </details>
      </div>
      <div v-if="dirty" class="mt-2 flex justify-end">
        <BaseButton size="sm" variant="primary" data-domain-save @click="save">{{ m.save }}</BaseButton>
      </div>
    </template>
    <p v-else class="text-[12px] text-ink-3">{{ ws.meta?.domainLogin.enabled ? m.on : m.off }} {{ m.adminOnly }}</p>
  </section>
</template>
