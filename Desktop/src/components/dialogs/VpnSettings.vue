<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plug, RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useVpnStore } from '@/stores/vpn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    title: 'Connessione all’ufficio (VPN)',
    hint: 'Usa una connessione VPN già configurata in Windows (Impostazioni › Rete e Internet › VPN). Todo Doto non vede né salva le credenziali.',
    none: 'Nessuna',
    choose: 'VPN per questo workspace',
    auto: 'Collega da sola quando la cartella condivisa non risponde',
    connect: 'Collega ora',
    connected: 'collegata',
    disconnected: 'non collegata',
    refresh: 'Aggiorna l’elenco',
    empty: 'Su questo PC non ci sono VPN configurate in Windows.',
    unsupported: 'Disponibile nell’app per Windows.',
    ok: 'VPN collegata.',
    needsCredentials: 'Windows chiede utente e password: collegati dal pannello VPN di Windows.',
    openWindows: 'Apri le VPN di Windows',
    failed: (msg: string) => `Collegamento non riuscito${msg ? `: ${msg}` : ''}.`,
  },
  en: {
    title: 'Office connection (VPN)',
    hint: 'Uses a VPN connection already configured in Windows (Settings › Network & Internet › VPN). Todo Doto never sees or stores the credentials.',
    none: 'None',
    choose: 'VPN for this workspace',
    auto: 'Connect by itself when the shared folder does not respond',
    connect: 'Connect now',
    connected: 'connected',
    disconnected: 'not connected',
    refresh: 'Refresh the list',
    empty: 'There are no VPNs configured in Windows on this PC.',
    unsupported: 'Available in the Windows app.',
    ok: 'VPN connected.',
    needsCredentials: 'Windows asks for user name and password: connect from the Windows VPN panel.',
    openWindows: 'Open Windows VPNs',
    failed: (msg: string) => `Connection failed${msg ? `: ${msg}` : ''}.`,
  },
})

/** Impostazioni › Dati utente: VPN da usare per il workspace aperto (scelta di questo PC). */
const vpn = useVpnStore()
const ws = useWorkspaceStore()
const ui = useUiStore()
const loading = ref(false)

const wsId = computed(() => ws.meta?.id ?? '')
const pref = computed(() => vpn.prefFor(wsId.value))
const selected = computed({
  get: () => pref.value?.name ?? '',
  set: (name: string) => void vpn.setPref(wsId.value, name, pref.value?.auto ?? true),
})
const auto = computed({
  get: () => pref.value?.auto ?? true,
  set: (v: boolean) => void vpn.setPref(wsId.value, selected.value, v),
})
const current = computed(() => vpn.list.find((v) => v.name === selected.value) ?? null)

async function reload() {
  loading.value = true
  try {
    await vpn.refresh()
  } finally {
    loading.value = false
  }
}
onMounted(reload)

async function connectNow() {
  const r = await vpn.connect(selected.value)
  if (r.ok) {
    ui.toast(m.ok, 'success')
    void ws.refresh()
  } else if (r.needsCredentials) ui.toast(m.needsCredentials, 'warning', { label: m.openWindows, run: () => void vpn.openWindowsVpn() }, 10000)
  else ui.toast(m.failed(r.message ?? ''), 'error', undefined, 8000)
}
</script>

<template>
  <section aria-labelledby="s-vpn-title" data-vpn-settings>
    <div class="flex items-center gap-2">
      <span id="s-vpn-title" class="label flex-1">{{ m.title }}</span>
      <BaseButton v-if="vpn.supported" size="icon-sm" variant="ghost" :title="m.refresh" :disabled="loading" @click="reload"><RefreshCw :size="13" /></BaseButton>
    </div>
    <p v-if="vpn.supported === false" class="text-[12px] text-ink-3">{{ m.unsupported }}</p>
    <template v-else-if="vpn.supported">
      <p v-if="!vpn.list.length" class="text-[12px] text-ink-3">{{ m.empty }}</p>
      <template v-else>
        <div class="flex items-center gap-2">
          <select v-model="selected" class="field flex-1" :aria-label="m.choose" data-vpn-select>
            <option value="">{{ m.none }}</option>
            <option v-for="v in vpn.list" :key="v.name" :value="v.name">{{ v.name }} ({{ v.connected ? m.connected : m.disconnected }})</option>
          </select>
          <BaseButton v-if="selected && !current?.connected" size="sm" :disabled="vpn.connecting" data-vpn-connect @click="connectNow"><Plug :size="13" /> {{ m.connect }}</BaseButton>
        </div>
        <label v-if="selected" class="mt-2 flex items-center gap-2 text-[13px]">
          <input v-model="auto" type="checkbox" class="accent-accent" data-vpn-auto />
          {{ m.auto }}
        </label>
      </template>
      <p class="mt-1 text-[12px] leading-snug text-ink-3">{{ m.hint }}</p>
    </template>
  </section>
</template>
