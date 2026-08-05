<script setup lang="ts">
const leadsStore = useLeadsStore()

const cards = computed(() => [
  { label: 'Jami', value: leadsStore.leads.length },
  { label: 'Yangi', value: leadsStore.statusCounts.NEW || 0 },
  { label: 'Jarayonda', value: leadsStore.statusCounts.IN_PROGRESS || 0 },
  { label: 'Tugallangan', value: leadsStore.statusCounts.COMPLETED || 0 },
  { label: "Ro'yxatga olingan", value: leadsStore.statusCounts.ENROLLED || 0 }
])
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
    <UCard v-for="card in cards" :key="card.label" :ui="{ body: 'p-4' }">
      <p class="text-2xl font-bold text-[var(--color-text-primary)] dark:text-white tabular-nums">{{ card.value }}</p>
      <p class="text-xs text-[var(--color-text-secondary)] mt-1">{{ card.label }}</p>
    </UCard>
  </div>
</template>
