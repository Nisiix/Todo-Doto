<script setup lang="ts">
import TopBar from '@/components/layout/TopBar.vue'
import SideRail from '@/components/layout/SideRail.vue'
import AiBanner from '@/components/layout/AiBanner.vue'
import OfflineReportDialog from '@/components/dialogs/OfflineReportDialog.vue'
import { onMounted } from 'vue'
import { useGitHubStore } from '@/stores/github'
import { useReadinessStore } from '@/stores/readiness'
import { useOutboxStore } from '@/stores/outbox'
import { useAiStore } from '@/stores/ai'
import { useHealthStore } from '@/stores/health'
import { useCalendarStore } from '@/stores/calendars'

// Progetti collegati a GitHub: lo stack si risincronizza da solo all'apertura (se attivo)
const github = useGitHubStore()
onMounted(() => void github.autoSyncOnOpen().catch(() => undefined))
// Configurazione dei PC: verifica dei prerequisiti in background, esiti condivisi e notifiche
useReadinessStore()
// Teams, email personali e riepilogo del mattino (se configurati dall'amministratore)
useOutboxStore()
// IA locale di questo PC: stato del motore (e, al primo avvio, ricerca di uno già installato)
const ai = useAiStore()
onMounted(() => void ai.start().catch(() => undefined))
// Salute dei progetti: istantanea della settimana (se nessun PC l'ha già scritta) e andamento
const health = useHealthStore()
onMounted(() => void health.maybeSnapshot().catch(() => undefined))
// Calendari .ics delle scadenze (se attivati su questo PC)
useCalendarStore()
</script>

<template>
  <div class="flex h-full flex-col">
    <TopBar />
    <div class="flex min-h-0 flex-1">
      <SideRail />
      <main class="relative flex min-w-0 flex-1">
        <RouterView />
        <AiBanner />
      </main>
    </div>
    <OfflineReportDialog />
  </div>
</template>
