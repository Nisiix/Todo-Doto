<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Send } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useUiStore } from '@/stores/ui'
import { isEmail } from '@/services/office'
import { testMail } from '@/services/mail'
import { MAIL_DEFAULTS, type MailSettings, type MailTopic } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    mine: 'Le tue email',
    myEmail: 'La tua email',
    myEmailHint: 'Facoltativa. Serve solo per i messaggi qui sotto, inviati dal workspace.',
    on: { mention: 'Quando qualcuno mi menziona (@nome)', assigned: 'Quando mi assegnano un task', digest: 'Il punto della giornata, ogni mattina' } as Record<MailTopic, string>,
    saveMine: 'Salva',
    savedMine: 'Preferenze email salvate.',
    invalid: 'Indirizzo email non valido.',
    ws: 'Invio delle email del workspace',
    wsHint: 'Senza un metodo di invio restano solo i pulsanti «Invia per email», che aprono il programma di posta.',
    method: { off: 'Nessuno', outlook: 'Outlook di chi invia (sul suo PC)', smtp: 'Server SMTP dell’azienda' },
    outlookHint: 'Ogni messaggio parte dall’Outlook installato sul PC di chi fa l’azione; serve Outlook classico per Windows.',
    host: 'Server',
    port: 'Porta',
    security: 'Sicurezza',
    sec: { starttls: 'STARTTLS (587)', tls: 'TLS (465)', none: 'Nessuna (solo rete interna)' },
    from: 'Mittente',
    user: 'Utente',
    password: 'Password',
    passwordKeep: 'Lasciala vuota per non cambiarla',
    passwordHint: 'Si salva cifrata con la password del workspace.',
    digest: 'Il punto della giornata',
    digestOn: 'Invia ogni mattina il punto a chi lo ha chiesto',
    digestHour: 'Dopo le ore',
    digestHint: 'Lo invia il primo PC di un amministratore aperto dopo l’ora scelta, una volta al giorno: in ritardo, in scadenza, completati, domande aperte, solo dei progetti che ognuno vede.',
    save: 'Salva',
    saved: 'Impostazioni email salvate.',
    failed: 'Salvataggio non riuscito.',
    test: 'Invia una prova a me',
    testOk: 'Email di prova inviata.',
    testFailed: 'Invio non riuscito: controlla le impostazioni.',
    testNeedEmail: 'Indica prima la tua email qui sopra.',
    adminOnly: 'Il metodo di invio lo sceglie un amministratore.',
  },
  en: {
    mine: 'Your emails',
    myEmail: 'Your email',
    myEmailHint: 'Optional. Used only for the messages below, sent by the workspace.',
    on: { mention: 'When someone mentions me (@name)', assigned: 'When a task is assigned to me', digest: 'My day, every morning' } as Record<MailTopic, string>,
    saveMine: 'Save',
    savedMine: 'Email preferences saved.',
    invalid: 'Invalid email address.',
    ws: 'Sending the workspace emails',
    wsHint: 'With no sending method only the “Send by email” buttons remain, which open the mail program.',
    method: { off: 'None', outlook: 'Outlook of the sender (on their PC)', smtp: 'Company SMTP server' },
    outlookHint: 'Each message leaves from the Outlook installed on the PC of whoever acts; classic Outlook for Windows is needed.',
    host: 'Server',
    port: 'Port',
    security: 'Security',
    sec: { starttls: 'STARTTLS (587)', tls: 'TLS (465)', none: 'None (internal network only)' },
    from: 'Sender',
    user: 'User',
    password: 'Password',
    passwordKeep: 'Leave empty to keep it',
    passwordHint: 'Saved encrypted with the workspace password.',
    digest: 'My day',
    digestOn: 'Send every morning the summary to those who asked for it',
    digestHour: 'After',
    digestHint: 'Sent once a day by the first administrator PC opened after the chosen hour: overdue, due soon, completed, open questions, only of the projects each person sees.',
    save: 'Save',
    saved: 'Email settings saved.',
    failed: 'Saving failed.',
    test: 'Send me a test',
    testOk: 'Test email sent.',
    testFailed: 'Sending failed: check the settings.',
    testNeedEmail: 'Enter your email above first.',
    adminOnly: 'The sending method is chosen by an administrator.',
  },
})

/** Impostazioni › Email e Teams (workspace di rete). */
const ws = useWorkspaceStore()
const ui = useUiStore()
const TOPICS: MailTopic[] = ['mention', 'assigned', 'digest']

// --- le mie email ---
const email = ref('')
const mailOn = ref<MailTopic[]>([])
watch(
  () => ws.currentUser,
  (u) => {
    email.value = u?.email ?? ''
    mailOn.value = [...(u?.mailOn ?? [])]
  },
  { immediate: true },
)
const myDirty = computed(() => email.value.trim() !== (ws.currentUser?.email ?? '') || mailOn.value.slice().sort().join() !== (ws.currentUser?.mailOn ?? []).slice().sort().join())
async function saveMine() {
  if (email.value.trim() && !isEmail(email.value)) return ui.toast(m.invalid, 'warning')
  await ws.setMyMail(email.value, email.value.trim() ? mailOn.value : [])
  ui.toast(m.savedMine, 'success')
}

// --- workspace (amministratori) ---
const draft = ref<MailSettings>(structuredClone(MAIL_DEFAULTS))
const smtpPassword = ref('')
watch(
  () => ws.meta?.mail,
  (v) => {
    draft.value = structuredClone(v ?? MAIL_DEFAULTS)
    smtpPassword.value = ''
  },
  { immediate: true, deep: true },
)
const wsDirty = computed(() => smtpPassword.value !== '' || JSON.stringify(draft.value) !== JSON.stringify(ws.meta?.mail ?? MAIL_DEFAULTS))
async function saveWs() {
  if (draft.value.method === 'smtp' && draft.value.smtp.from && !isEmail(draft.value.smtp.from)) return ui.toast(m.invalid, 'warning')
  const ok = await ws.setMailSettings(draft.value, smtpPassword.value || undefined)
  ui.toast(ok ? m.saved : m.failed, ok ? 'success' : 'error')
}
const testing = ref(false)
async function sendTest() {
  const to = ws.currentUser?.email ?? ''
  if (!isEmail(to)) return ui.toast(m.testNeedEmail, 'warning')
  testing.value = true
  try {
    const ok = await ws.sendMail({ to: [to], ...testMail() })
    ui.toast(ok === true ? m.testOk : m.testFailed, ok === true ? 'success' : 'error', undefined, 6000)
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="space-y-6" data-mail-settings>
    <section aria-labelledby="s-mymail">
      <span id="s-mymail" class="label">{{ m.mine }}</span>
      <label for="s-myemail" class="mb-1 block text-[12.5px] text-ink-2">{{ m.myEmail }}</label>
      <input id="s-myemail" v-model="email" type="email" class="field" placeholder="nome@azienda.it" data-my-email />
      <p class="mt-1 text-[12px] text-ink-3">{{ m.myEmailHint }}</p>
      <div class="mt-2 space-y-1.5">
        <label v-for="t in TOPICS" :key="t" class="flex items-center gap-2 text-[13px]" :class="{ 'opacity-50': !email.trim() }">
          <input v-model="mailOn" type="checkbox" class="accent-accent" :value="t" :disabled="!email.trim()" :data-mail-on="t" />
          {{ m.on[t] }}
        </label>
      </div>
      <div v-if="myDirty" class="mt-2 flex justify-end"><BaseButton size="sm" variant="primary" data-my-mail-save @click="saveMine">{{ m.saveMine }}</BaseButton></div>
    </section>

    <section aria-labelledby="s-wsmail">
      <span id="s-wsmail" class="label">{{ m.ws }}</span>
      <template v-if="ws.isAdmin">
        <div class="space-y-1.5">
          <label v-for="k in (['off', 'outlook', 'smtp'] as const)" :key="k" class="flex items-center gap-2 text-[13px]">
            <input v-model="draft.method" type="radio" name="mail-method" class="accent-accent" :value="k" :data-mail-method="k" /> {{ m.method[k] }}
          </label>
        </div>
        <p class="mt-1 text-[12px] text-ink-3">{{ draft.method === 'outlook' ? m.outlookHint : m.wsHint }}</p>
        <div v-if="draft.method === 'smtp'" class="mt-3 grid grid-cols-[1fr_6rem] gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-[12.5px]">
          <label class="col-span-1">{{ m.host }}<input v-model="draft.smtp.host" class="field mt-1" placeholder="smtp.azienda.it" data-smtp-host /></label>
          <label>{{ m.port }}<input v-model.number="draft.smtp.port" type="number" min="1" max="65535" class="field mt-1" /></label>
          <label class="col-span-2">{{ m.security }}
            <select v-model="draft.smtp.security" class="field mt-1">
              <option v-for="k in (['starttls', 'tls', 'none'] as const)" :key="k" :value="k">{{ m.sec[k] }}</option>
            </select>
          </label>
          <label class="col-span-2">{{ m.from }}<input v-model="draft.smtp.from" type="email" class="field mt-1" placeholder="todo@azienda.it" data-smtp-from /></label>
          <label>{{ m.user }}<input v-model="draft.smtp.user" class="field mt-1" autocomplete="off" /></label>
          <span />
          <label class="col-span-2">{{ m.password }}
            <input v-model="smtpPassword" type="password" class="field mt-1" autocomplete="new-password" :placeholder="draft.smtp.secret ? m.passwordKeep : ''" data-smtp-password />
            <span class="mt-1 block text-[11.5px] text-ink-3">{{ m.passwordHint }}</span>
          </label>
        </div>
        <div class="mt-4 rounded-md border border-line px-3 py-2.5">
          <p class="text-[12.5px] font-medium">{{ m.digest }}</p>
          <label class="mt-1.5 flex items-center gap-2 text-[13px]" :class="{ 'opacity-50': draft.method === 'off' }">
            <input v-model="draft.digest.enabled" type="checkbox" class="accent-accent" :disabled="draft.method === 'off'" data-digest-toggle /> {{ m.digestOn }}
          </label>
          <label v-if="draft.digest.enabled" class="mt-1.5 flex items-center gap-2 pl-6 text-[12.5px] text-ink-2">
            {{ m.digestHour }}
            <select v-model.number="draft.digest.hour" class="field !h-8 !w-auto !py-0">
              <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}:00</option>
            </select>
          </label>
          <p class="mt-1 text-[12px] text-ink-3">{{ m.digestHint }}</p>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <BaseButton v-if="ws.meta?.mail.method !== 'off' && !wsDirty" size="sm" :disabled="testing" data-mail-test @click="sendTest"><Send :size="13" /> {{ m.test }}</BaseButton>
          <BaseButton v-if="wsDirty" size="sm" variant="primary" data-mail-save @click="saveWs">{{ m.save }}</BaseButton>
        </div>
      </template>
      <p v-else class="text-[12px] text-ink-3">{{ m.method[ws.meta?.mail.method ?? 'off'] }} · {{ m.adminOnly }}</p>
    </section>
  </div>
</template>
