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
  <div class="inline-flex items-center gap-1 p-1 rounded-md bg-primary-900">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="relative flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors duration-150"
      :class="props.modelValue === tab.value ? 'bg-white text-primary-900 shadow-sm' : 'text-white hover:bg-white/10'"
      @click="emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
      <span
        class="text-[11px] font-semibold rounded-sm px-1.5 py-0.5 min-w-[1.25rem] text-center"
        :class="props.modelValue === tab.value ? 'bg-secondary-600 text-primary-950' : 'bg-white/15 text-white'"
      >
        {{ props.counts[tab.value] }}
      </span>
    </button>
  </div>
</template>
