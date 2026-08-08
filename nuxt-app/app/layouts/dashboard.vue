<script setup lang="ts">
const { open: profileModalOpen } = useProfileModal()

// Mount the realtime sync connection for the entire dashboard session.
// Placing it here (not per-page) ensures a single EventSource is shared
// across all dashboard pages and is properly cleaned up when the user logs out.
const { status: realtimeStatus } = useRealtimeSync()
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[var(--color-bg)] dark:bg-[var(--color-bg-dark)] bg-pattern-grid">
    <DashboardAppTopbar :realtime-status="realtimeStatus" />

    <main class="flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-[1400px] w-full mx-auto">
      <slot />
    </main>

    <DashboardProfileModal v-model:open="profileModalOpen" />
  </div>
</template>
