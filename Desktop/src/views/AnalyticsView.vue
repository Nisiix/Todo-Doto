<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { BarChart3 } from 'lucide-vue-next'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { summarize } from '@/services/analytics'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '@/types'

/**
 * Riepilogo numerico del workspace per gli amministratori: progetti, elementi
 * per contenitore/stato/priorità, scadenze, carico per utente e per progetto.
 */
const ws = useWorkspaceStore()
const today = dayjs().format('YYYY-MM-DD')
const s = computed(() => summarize(Object.values(ws.projects), today))
const favorites = computed(() => ws.favoriteProjects.length)

const tiles = computed(() => [
  { label: 'Progetti attivi', value: s.value.projects.active, hint: `${s.value.projects.trashed} nel cestino · ${favorites.value} preferiti` },
  { label: 'Da fare', value: s.value.items.todo, hint: `${s.value.withoutDue} senza scadenza` },
  { label: 'Completati', value: s.value.items.done, hint: 'in tutti i progetti' },
  { label: 'Nel cestino', value: s.value.items.trash, hint: 'elementi recuperabili' },
  { label: 'Scaduti', value: s.value.overdue, hint: 'da fare con scadenza passata', tone: s.value.overdue ? 'text-danger' : '' },
  { label: 'In scadenza', value: s.value.dueSoon, hint: 'entro 7 giorni', tone: s.value.dueSoon ? 'text-p-alta' : '' },
  { label: 'Domande aperte', value: s.value.openQuestions, hint: 'in attesa di risposta' },
])
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)
const statusColor = { da_valutare: 'var(--ink-3)', da_definire: 'var(--accent)', confermato: 'var(--accent-ink)' } as const
</script>

<template>
  <div class="w-full overflow-y-auto px-10 py-8">
    <h1 class="flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><BarChart3 :size="22" class="text-accent" /> Analisi</h1>
    <p class="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
      Il quadro del workspace adesso: quanto c'è da fare, in che stato, con quale urgenza e su chi pesa. Si aggiorna da solo con i dati.
    </p>

    <!-- Numeri principali -->
    <div class="mt-6 grid max-w-5xl grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4 lg:grid-cols-7">
      <div v-for="t in tiles" :key="t.label">
        <div class="text-[11.5px] font-semibold text-ink-3">{{ t.label }}</div>
        <div class="text-[30px] font-extrabold leading-none tracking-tight tabular-nums" :class="t.tone">{{ t.value }}</div>
        <div class="mt-1 text-[11.5px] text-ink-3">{{ t.hint }}</div>
      </div>
    </div>

    <div class="mt-10 grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-2">
      <!-- Per stato -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">Da fare per stato</h2>
        <ul class="space-y-2">
          <li v-for="st in STATUSES" :key="st" class="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-[13px]">
            <span>{{ STATUS_LABEL[st] }}</span>
            <span class="h-2.5 rounded-full bg-surface-2"><span class="block h-full rounded-full" :style="{ width: pct(s.byStatus[st], s.items.todo) + '%', background: statusColor[st] }" /></span>
            <span class="text-right tabular-nums text-ink-2">{{ s.byStatus[st] }}</span>
          </li>
        </ul>
      </section>

      <!-- Per priorità -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">Da fare per priorità</h2>
        <ul class="space-y-2">
          <li v-for="p in [...PRIORITIES].reverse()" :key="p" class="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-[13px]">
            <span class="flex items-center gap-2"><span class="h-2 w-2 rounded-full" :class="`bg-p-${p}`" />{{ PRIORITY_LABEL[p] }}</span>
            <span class="h-2.5 rounded-full bg-surface-2"><span class="block h-full rounded-full" :class="`bg-p-${p}`" :style="{ width: pct(s.byPriority[p], s.items.todo) + '%' }" /></span>
            <span class="text-right tabular-nums text-ink-2">{{ s.byPriority[p] }}</span>
          </li>
        </ul>
      </section>

      <!-- Per utente -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">Carico per utente (elementi assegnati)</h2>
        <table v-if="s.byUser.length" class="w-full text-[13px]">
          <thead class="text-[11.5px] text-ink-3">
            <tr><th class="pb-1 text-left font-semibold">Utente</th><th class="pb-1 text-right font-semibold">Da fare</th><th class="pb-1 text-right font-semibold">Immediati</th><th class="pb-1 text-right font-semibold">Scaduti</th><th class="pb-1 text-right font-semibold">Completati</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="u in s.byUser" :key="u.userId ?? 'none'">
              <td class="flex items-center gap-2 py-1.5">
                <UserAvatar v-if="u.userId" :name="ws.userName(u.userId)" size="xs" />
                <span :class="{ 'text-ink-3': !u.userId }">{{ u.userId ? ws.userName(u.userId) : 'Non assegnati' }}</span>
              </td>
              <td class="py-1.5 text-right tabular-nums font-semibold">{{ u.todo }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-p-immediata': u.immediata }">{{ u.immediata }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-danger': u.overdue }">{{ u.overdue }}</td>
              <td class="py-1.5 text-right tabular-nums text-ink-2">{{ u.done }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-[13px] text-ink-3">Nessun elemento ancora. Assegna gli elementi alle persone dal dettaglio o alla creazione.</p>
      </section>

      <!-- Per progetto -->
      <section>
        <h2 class="mb-3 text-[13px] font-semibold text-ink-2">Per progetto</h2>
        <table v-if="s.byProject.length" class="w-full text-[13px]">
          <thead class="text-[11.5px] text-ink-3">
            <tr><th class="pb-1 text-left font-semibold">Progetto</th><th class="pb-1 text-right font-semibold">Da fare</th><th class="pb-1 text-right font-semibold">Immediati</th><th class="pb-1 text-right font-semibold">Scaduti</th><th class="pb-1 text-right font-semibold">Completati</th><th class="pb-1 text-right font-semibold">Cestino</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="p in s.byProject" :key="p.id">
              <td class="py-1.5"><RouterLink :to="{ name: 'project', params: { id: p.id } }" class="hover:underline">{{ p.name }}</RouterLink></td>
              <td class="py-1.5 text-right tabular-nums font-semibold">{{ p.todo }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-p-immediata': p.immediata }">{{ p.immediata }}</td>
              <td class="py-1.5 text-right tabular-nums" :class="{ 'text-danger': p.overdue }">{{ p.overdue }}</td>
              <td class="py-1.5 text-right tabular-nums text-ink-2">{{ p.done }}</td>
              <td class="py-1.5 text-right tabular-nums text-ink-3">{{ p.trash }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-[13px] text-ink-3">Nessun progetto attivo.</p>
      </section>
    </div>
  </div>
</template>
