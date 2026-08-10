<script setup lang="ts">
import type { Student } from '~/types/student'

const props = defineProps<{
  university: string
  students: Student[]
  currentFilter: string
  checkingPassports: Map<string, 'queued' | 'processing'>
}>()

const emit = defineEmits<{
  'edit': [student: Student]
  'details': [student: Student]
  'delete': [student: Student]
  'refresh': [student: Student]
  'download-pdf': [student: Student]
  'toggle-select': [student: Student, checked: boolean]
  'toggle-pin': [student: Student]
}>()

const isOpen = ref(true)
const displayName = computed(() => props.university || 'No University')
</script>

<template>
  <div class="rounded-xl border border-neutral-300 dark:border-white/20 shadow-[0_8px_30px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.7)] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
    <!-- Accordion header -->
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-primary-50/60 dark:hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-3 min-w-0">
        <span class="flex-shrink-0 size-8 rounded-lg bg-primary-100 dark:bg-primary-950/60 flex items-center justify-center">
          <UIcon name="i-lucide-landmark" class="size-4 text-primary-700 dark:text-primary-400" />
        </span>
        <span class="font-semibold text-[var(--color-text-primary)] dark:text-white text-sm truncate">
          {{ displayName }}
        </span>
        <span class="flex-shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-bold bg-primary-700 dark:bg-primary-600 text-white">
          {{ students.length }}
        </span>
      </div>
      <UIcon
        name="i-lucide-chevron-down"
        class="flex-shrink-0 size-4 text-[var(--color-text-secondary)] transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- Collapsible body -->
    <div
      v-show="isOpen"
      class="border-t border-neutral-200 dark:border-white/10 accordion-body"
      :class="isOpen ? 'accordion-open' : 'accordion-closed'"
    >
      <StudentStudentsTable
        :students="students"
        :current-filter="currentFilter"
        :checking-passports="checkingPassports"
        @edit="emit('edit', $event)"
        @details="emit('details', $event)"
        @delete="emit('delete', $event)"
        @refresh="emit('refresh', $event)"
        @download-pdf="emit('download-pdf', $event)"
        @toggle-select="(s, c) => emit('toggle-select', s, c)"
        @toggle-pin="emit('toggle-pin', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.accordion-body {
  transition: opacity 0.2s ease;
}
.accordion-closed {
  opacity: 0;
}
.accordion-open {
  opacity: 1;
}
</style>
