<script setup lang="ts">
const { open: profileModalOpen } = useProfileModal()

// Mount the realtime sync connection for the entire dashboard session.
// Placing it here (not per-page) ensures a single EventSource is shared
// across all dashboard pages and is properly cleaned up when the user logs out.
const { status: realtimeStatus } = useRealtimeSync()

// Track mouse cursor for background glow effect
const { x, y } = useMouse()
const hasMoved = ref(false)

watch([x, y], () => {
  if (x.value !== 0 || y.value !== 0) {
    hasMoved.value = true
  }
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[var(--color-bg)] dark:bg-[var(--color-bg-dark)] bg-pattern-grid relative overflow-hidden">
    <!-- Interactive Background Mouse Glow -->
    <div
      v-if="hasMoved"
      class="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div
        class="absolute size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(31,110,88,0.13)_0%,rgba(16,185,129,0.03)_60%,transparent_100%)] dark:bg-[radial-gradient(circle,rgba(16,185,129,0.16)_0%,rgba(16,185,129,0.04)_60%,transparent_100%)] blur-3xl transition-opacity duration-300"
        :style="{
          left: `${x}px`,
          top: `${y}px`
        }"
      />
    </div>

    <DashboardAppTopbar
      class="relative z-10"
      :realtime-status="realtimeStatus"
    />

    <main class="flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-[1400px] w-full mx-auto relative z-10">
      <slot />
    </main>

    <DashboardProfileModal v-model:open="profileModalOpen" />
  </div>
</template>
