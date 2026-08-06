<script setup lang="ts">
import type { StatusFilter } from '~/types/student'

const props = defineProps<{
  modelValue: StatusFilter
  counts: Record<StatusFilter, number>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: StatusFilter] }>()

const tabs: { value: StatusFilter, label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'application', label: 'Application' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'approved', label: 'Approved' }
]
</script>

<template>
  <div class="grid grid-cols-4 sm:inline-flex sm:items-center gap-1 p-1 rounded-md bg-primary-900 w-full sm:w-auto">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-sm px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-sm font-medium leading-tight transition-colors duration-150 whitespace-nowrap"
      :class="props.modelValue === tab.value ? 'bg-white text-primary-900 shadow-sm' : 'text-white hover:bg-white/10'"
      @click="emit('update:modelValue', tab.value)"
    >
      <span>{{ tab.label }}</span>
      <span
        class="text-[10px] sm:text-[11px] font-semibold rounded-sm px-1 sm:px-1.5 py-0.5 min-w-[1.1rem] sm:min-w-[1.25rem] text-center"
        :class="props.modelValue === tab.value ? 'bg-secondary-600 text-primary-950' : 'bg-white/15 text-white'"
      >
        {{ props.counts[tab.value] }}
      </span>
    </button>
  </div>
</template>
