<script setup lang="ts">
import TopBar from '@/components/layout/TopBar.vue'
import SideRail from '@/components/layout/SideRail.vue'
import PlanBanner from '@/components/layout/PlanBanner.vue'
import LicenseDialog from '@/components/dialogs/LicenseDialog.vue'
</script>

<template>
  <div class="flex h-full flex-col">
    <TopBar />
    <PlanBanner />
    <div class="flex min-h-0 flex-1">
      <SideRail />
      <main class="relative flex min-w-0 flex-1">
        <RouterView />
      </main>
    </div>
    <LicenseDialog />
  </div>
</template>
