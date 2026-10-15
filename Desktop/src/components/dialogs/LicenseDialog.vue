<script setup lang="ts">
import { t, tn } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { BadgeCheck, ExternalLink, FileKey2, FolderOpen, Trash2 } from 'lucide-vue-next'
import dayjs from 'dayjs'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { useConfirm } from '@/composables/useConfirm'
import { getFs } from '@/services/fs'
import { PRICING_URL } from '@/services/branding'
import { describePlan, FEATURE_LABEL, PLANS, TRIAL_DAYS, seatsLabel, type PlanId } from '@/services/license'

/**
 * Piano corrente, posti usati, prova e installazione della licenza
 * (incollata o scelta da file). La licenza è un file nel workspace: una
 * licenza, un ufficio.
 */
const ws = useWorkspaceStore()
const ui = useUiStore()
const confirm = useConfirm()
const open = computed({ get: () => ui.showLicense, set: (v) => (ui.showLicense = v) })

const text = ref('')
const error = ref('')
const busy = ref(false)
watch(open, (o) => {
  if (o) {
    text.value = ''
    error.value = ''
  }
})

const state = computed(() => ws.plan)
const current = computed(() => PLANS[state.value.plan])
const seatsUsed = computed(() => (ws.isNetwork ? ws.users.length : 1))

const plans = computed(() =>
  (['free', 'team', 'business'] as PlanId[]).map((id) => ({
    ...PLANS[id],
    current: id === state.value.plan,
  })),
)

async function install() {
  error.value = ''
  busy.value = true
  const err = await ws.installLicense(text.value)
  busy.value = false
  if (err) return (error.value = err)
  ui.toast(t('Licenza {plan} attivata. Grazie!', { plan: PLANS[ws.plan.plan].label }), 'success', undefined, 5000)
  open.value = false
}

async function pickFile() {
  const fs = await getFs()
  const p = await fs.pickFile('Scegli il file license.json')
  if (!p) return
  try {
    text.value = await fs.readText(p)
    await install()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function remove() {
  if (await confirm({ title: t('Rimuovere la licenza da questo workspace?'), message: t('Il workspace torna al piano Free. Potrai reinstallarla in qualsiasi momento.'), confirmLabel: t('Rimuovi'), danger: true }))
    await ws.removeLicense()
}

async function startTrial() {
  await ws.startTrial()
  if (ws.plan.source === 'trial') ui.toast(t('Prova del piano Team attiva per {n} giorni.', { n: TRIAL_DAYS }), 'success')
}

const openPricing = async () => (await getFs()).openExternal(PRICING_URL, 'link')
</script>

<template>
  <BaseDialog v-model:open="open" :title="t('Piano e licenza')" width="lg">
    <div class="space-y-5">
      <section class="flex items-start gap-3 rounded-md border border-line bg-surface-2/60 p-3">
        <BadgeCheck :size="20" class="mt-0.5 shrink-0" :class="state.source === 'free' ? 'text-ink-3' : 'text-accent'" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold">{{ describePlan(state) }}</p>
          <p class="text-[12.5px] text-ink-2">
            <template v-if="ws.isNetwork">
              {{ tn(seatsUsed, '1 membro', '{n} membri') }} · {{ t('piano con {seats}', { seats: seatsLabel(current.seats) }) }}.
              <span v-if="ws.overSeats" class="text-danger">{{ t('I membri oltre il {n}° sono in sola lettura.', { n: current.seats ?? 0 }) }}</span>
            </template>
            <template v-else>{{ t('Workspace locale: uso personale senza limiti.') }}</template>
          </p>
          <p v-if="state.license" class="mt-1 text-[12px] text-ink-3">
            {{ t('Intestata a') }} {{ state.license.issuedTo }} ({{ state.license.email }}) · {{ seatsLabel(state.license.seats) }} · emessa il {{ dayjs(state.license.issuedAt).format('D MMM YYYY') }}
            <template v-if="state.licenseStatus === 'expired'"> · <b class="text-danger">scaduta il {{ dayjs(state.license.expiresAt).format('D MMM YYYY') }}</b></template>
          </p>
          <p v-if="ws.licenseError" class="mt-1 text-[12.5px] text-danger">{{ t('Il file license.json presente nella cartella non è valido: {error}', { error: ws.licenseError }) }}</p>
        </div>
        <BaseButton v-if="state.license && ws.isAdmin" size="sm" variant="ghost" class="text-danger" :title="t('Rimuovi la licenza dal workspace')" @click="remove"><Trash2 :size="13" /></BaseButton>
      </section>

      <section>
        <span class="label">{{ t('Piani') }}</span>
        <div class="grid grid-cols-3 gap-2">
          <div v-for="p in plans" :key="p.id" class="rounded-md border p-3 text-[12.5px]" :class="p.current ? 'border-accent bg-accent-soft/50' : 'border-line'">
            <div class="flex items-baseline justify-between">
              <span class="text-[14px] font-bold">{{ p.label }}</span>
              <span v-if="p.current" class="text-[11px] font-semibold text-accent-ink">{{ t('attuale') }}</span>
            </div>
            <p class="mt-0.5 text-ink-2">{{ p.price }}</p>
            <p class="mt-1 text-ink-2">{{ p.seats === null ? t('Utenti illimitati') : t('Fino a {n} utenti in rete', { n: p.seats }) }}</p>
            <ul class="mt-1.5 space-y-0.5 text-ink-3">
              <li v-for="f in p.features" :key="f">{{ t(FEATURE_LABEL[f]) }}</li>
              <li v-if="!p.features.length">{{ t('Tutte le funzioni di base, uso locale illimitato') }}</li>
            </ul>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <BaseButton size="sm" @click="openPricing"><ExternalLink :size="13" /> {{ t('Prezzi e acquisto') }}</BaseButton>
          <BaseButton v-if="ws.isNetwork && state.source === 'free' && !state.trialUsed" size="sm" variant="soft" @click="startTrial">{{ t('Avvia la prova di {n} giorni del piano Team', { n: TRIAL_DAYS }) }}</BaseButton>
          <span v-else-if="state.source === 'free' && state.trialUsed" class="text-[12px] text-ink-3">{{ t('La prova gratuita è già stata usata in questo workspace.') }}</span>
        </div>
      </section>

      <section>
        <span class="label">{{ t('Attiva una licenza') }}</span>
        <p class="mb-1.5 text-[12px] text-ink-3">{{ t('Incolla il testo ricevuto per email oppure scegli il file') }} <code>{{ t('license.json') }}</code>{{ t('. Il file viene salvato nella cartella del workspace e vale per tutti i membri; la verifica avviene sul tuo PC, senza internet.') }}</p>
        <textarea v-model="text" class="field min-h-24 resize-y font-mono text-[12px]" placeholder='{"v":1,"plan":"team", …}' spellcheck="false" />
        <p v-if="error" class="mt-1 text-[13px] text-danger">{{ error }}</p>
        <div class="mt-2 flex gap-2">
          <BaseButton variant="primary" size="sm" :disabled="busy || !text.trim()" @click="install"><FileKey2 :size="13" /> {{ t('Attiva') }}</BaseButton>
          <BaseButton size="sm" :disabled="busy" @click="pickFile"><FolderOpen :size="13" /> {{ t('Scegli file…') }}</BaseButton>
        </div>
      </section>
    </div>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">{{ t('Chiudi') }}</BaseButton>
    </template>
  </BaseDialog>
</template>
