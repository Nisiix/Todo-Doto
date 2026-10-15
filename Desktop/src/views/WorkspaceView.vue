<script setup lang="ts">
import TopBar from '@/components/layout/TopBar.vue'
import SideRail from '@/components/layout/SideRail.vue'
import { onMounted } from 'vue'
import { useGitHubStore } from '@/stores/github'
import { useReadinessStore } from '@/stores/readiness'

// Progetti collegati a GitHub: lo stack si risincronizza da solo all'apertura (se attivo)
const github = useGitHubStore()
onMounted(() => void github.autoSyncOnOpen().catch(() => undefined))
// Configurazione dei PC: verifica dei prerequisiti in background, esiti condivisi e notifiche
useReadinessStore()
</script>

<template>
  <div class="flex h-full flex-col">
    <TopBar />
    <div class="flex min-h-0 flex-1">
      <SideRail />
      <main class="relative flex min-w-0 flex-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
