<script setup lang="ts">
import type { LeadStatus } from '~/types/lead'

const leadsStore = useLeadsStore()

const tabs: { value: LeadStatus | 'all', label: string }[] = [
  { value: 'all', label: 'Barchasi' },
  { value: 'NEW', label: 'Yangi' },
  { value: 'IN_PROGRESS', label: 'Jarayonda' },
  { value: 'COMPLETED', label: 'Tugallangan' },
  { value: 'CONTACTED', label: "Bog'lanilgan" },
  { value: 'ENROLLED', label: "Ro'yxatga olingan" },
  { value: 'CANCELLED', label: 'Bekor qilingan' }
]
</script>

<template>
  <div class="inline-flex items-center gap-1 p-1 rounded-md bg-primary-50 dark:bg-white/5 overflow-x-auto max-w-full">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="shrink-0 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
      :class="leadsStore.activeFilter === tab.value
        ? 'bg-white dark:bg-primary-900 text-primary-900 dark:text-white shadow-sm'
        : 'text-[var(--color-text-secondary)] hover:text-primary-800 dark:hover:text-white'"
      @click="leadsStore.setFilter(tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
