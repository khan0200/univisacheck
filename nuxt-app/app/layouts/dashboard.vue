<script setup lang="ts">
const { open: profileModalOpen } = useProfileModal()
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[var(--color-bg)] dark:bg-[var(--color-bg-dark)] bg-pattern-grid">
    <DashboardAppTopbar />

    <main class="flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-[1400px] w-full mx-auto">
      <slot />
    </main>

    <DashboardProfileModal v-model:open="profileModalOpen" />
  </div>
</template>
