<script setup lang="ts">
import type { VisaTypeFilter } from '~/types/student'

const props = defineProps<{
  modelValue: VisaTypeFilter
  counts: Record<VisaTypeFilter, number>
}>()

const emit = defineEmits<{ 'update:modelValue': [value: VisaTypeFilter] }>()

const options: { value: VisaTypeFilter; label: string; icon?: string }[] = [
  { value: 'all', label: 'All', icon: 'i-lucide-layers' },
  { value: 'Embassy', label: 'Embassy', icon: 'i-lucide-building-2' },
  { value: 'E-Visa', label: 'E-Visa', icon: 'i-lucide-file-text' },
  { value: 'Regional', label: 'Regional', icon: 'i-lucide-map' }
]
</script>

<template>
  <div class="inline-flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-white/5 ring-1 ring-inset ring-neutral-200/80 dark:ring-white/10 w-full sm:w-auto">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium leading-tight transition-all duration-150"
      :class="props.modelValue === opt.value
        ? 'bg-primary-50 dark:bg-primary-900 text-primary-950 dark:text-white shadow-xs font-semibold'
        : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-white/5'"
      @click="emit('update:modelValue', opt.value)"
    >
      <UIcon v-if="opt.icon" :name="opt.icon" class="size-3.5 shrink-0 opacity-70" />
      <span>{{ opt.label }}</span>
      <span
        class="text-[10px] font-semibold rounded px-1.5 py-0.5 text-center transition-colors"
        :class="props.modelValue === opt.value
          ? 'bg-primary-100 dark:bg-white/15 text-primary-900 dark:text-white'
          : 'bg-neutral-200/70 dark:bg-white/10 text-neutral-600 dark:text-neutral-400'"
      >
        {{ props.counts[opt.value] || 0 }}
      </span>
    </button>
  </div>
</template>
