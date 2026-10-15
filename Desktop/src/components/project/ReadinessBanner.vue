<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { AlertTriangle, Monitor } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { incompleteUsers, prereqsOf } from '@/services/readiness'
import type { Project, ReadinessMissing } from '@/types'
import { defineMessages, plural } from '@/i18n'
import { common } from '@/i18n/common'

const m = defineMessages({
  it: {
    banner: (n: number) =>
      `${n} ${plural(n, 'utente ha', 'utenti hanno')} una configurazione incompleta per questo progetto: sul ${plural(n, 'suo PC', 'loro PC')} manca qualcosa tra i prerequisiti.`,
    view: 'Visualizza',
    title: 'Configurazione incompleta',
    lead: 'Utenti che vedono il progetto e al cui PC, all’ultima verifica, manca qualcosa. Ognuno lo vede anche nelle proprie notifiche; la verifica si ripete da sola quando apre l’app.',
    checked: (host: string, when: string) => `${host ? `${host} · ` : ''}verificato ${when}`,
    missing: 'non installato',
    outdated: (found: string, req: string) => `${found ? `versione ${found}` : 'versione vecchia'}${req ? `, serve ${req}` : ''}`,
  },
  en: {
    banner: (n: number) =>
      `${n} ${plural(n, 'user has', 'users have')} an incomplete setup for this project: something among the prerequisites is missing on ${plural(n, 'their PC', 'their PCs')}.`,
    view: 'View',
    title: 'Incomplete setup',
    lead: 'Users who see the project and whose PC, at the last check, is missing something. Each of them also sees it in their notifications; the check runs again by itself when they open the app.',
    checked: (host: string, when: string) => `${host ? `${host} · ` : ''}checked ${when}`,
    missing: 'not installed',
    outdated: (found: string, req: string) => `${found ? `version ${found}` : 'old version'}${req ? `, needs ${req}` : ''}`,
  },
})

/**
 * Banner rosso nello Stack (solo workspace di rete): compare quando almeno un
 * utente che vede il progetto ha una configurazione incompleta, con
 * "Visualizza" per l'elenco dei soli utenti a cui manca qualcosa.
 */
const props = defineProps<{ project: Project }>()
const ws = useWorkspaceStore()
const open = ref(false)

const list = computed(() =>
  ws.isNetwork ? incompleteUsers(props.project.id, prereqsOf(props.project), ws.users, ws.readiness, (u) => ws.canUserSee(u, props.project)) : [],
)
const detail = (x: ReadinessMissing) => (x.status === 'missing' ? m.missing : m.outdated(x.found, x.required))
</script>

<template>
  <div v-if="list.length" class="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger" role="alert" data-readiness-banner>
    <AlertTriangle :size="17" class="shrink-0" />
    <p class="flex-1 font-medium leading-snug">{{ m.banner(list.length) }}</p>
    <BaseButton size="sm" variant="outline" class="shrink-0 border-danger/50 text-danger hover:bg-danger/10" @click="open = true">{{ m.view }}</BaseButton>
  </div>

  <BaseDialog v-model:open="open" :title="m.title" :description="m.lead" width="md">
    <ul class="divide-y divide-line" data-readiness-list>
      <li v-for="r in list" :key="r.user.id" class="flex items-start gap-3 py-3">
        <UserAvatar :name="r.user.displayName" size="md" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ r.user.displayName }}</span>
            <span v-if="r.user.id === ws.currentUser?.id" class="text-[12px] text-ink-3">({{ common.you }})</span>
          </div>
          <p class="flex items-center gap-1 text-[12px] text-ink-3"><Monitor :size="11" /> {{ m.checked(r.host, dayjs(r.entry.checkedAt).fromNow()) }}</p>
          <ul class="mt-1.5 space-y-0.5">
            <li v-for="x in r.entry.missing" :key="x.name" class="text-[13px]">
              <span class="font-medium text-danger">{{ x.name }}</span>
              <span class="text-ink-2"> — {{ detail(x) }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ul>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">{{ common.actions.close }}</BaseButton>
    </template>
  </BaseDialog>
</template>
