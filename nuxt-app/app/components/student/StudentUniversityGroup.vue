<script setup lang="ts">
import type { Student } from '~/types/student'

const props = defineProps<{
  groupName: string
  students: Student[]
  currentFilter: string
  checkingPassports: Map<string, 'queued' | 'processing'>
}>()

const emit = defineEmits<{
  'edit': [student: Student]
  'details': [student: Student]
  'delete': [student: Student]
  'refresh': [student: Student]
  'refresh-group': [students: Student[]]
  'download-pdf': [student: Student]
  'toggle-select': [student: Student, checked: boolean]
  'toggle-pin': [student: Student]
  'deselect-group': [students: Student[]]
}>()

const isOpen = ref(true)
const displayName = computed(() => props.groupName || 'No Group')
const groupIsChecking = computed(() => props.students.some(s => props.checkingPassports.has(s.passport)))

const groupIcon = computed(() => {
  const name = props.groupName.toLowerCase()
  if (name.includes('under review')) return 'i-lucide-eye'
  if (name.includes('supplement submitted') || name.includes('supplement completed')) return 'i-lucide-file-check'
  if (name.includes('supplement')) return 'i-lucide-alert-circle'
  if (/^\d{4}[-./]\d{1,2}/.test(props.groupName)) return 'i-lucide-calendar'
  if (name === 'standard' || name === 'vip' || name === 'premium') return 'i-lucide-tag'
  return 'i-lucide-landmark'
})
</script>

<template>
  <div class="rounded-xl border border-neutral-300 dark:border-white/20 shadow-[0_8px_30px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.7)] overflow-hidden bg-white dark:bg-[var(--color-card-dark)]">
    <!-- Accordion header -->
    <div class="w-full flex items-center justify-between bg-[#0B4133] hover:bg-[#0d4e3d] transition-colors group">
      <!-- Clickable area to toggle accordion -->
      <button
        type="button"
        class="flex-1 flex items-center gap-2 px-4 py-2 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset"
        :aria-expanded="isOpen"
        @click="isOpen = !isOpen"
      >
        <UIcon
          :name="groupIcon"
          class="flex-shrink-0 size-3.5 text-white"
        />
        <span class="font-semibold text-white text-xs truncate tracking-wide">
          {{ displayName }}
        </span>
        <span class="flex-shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold bg-primary-600/70 text-white">
          {{ students.length }}
        </span>
      </button>

      <!-- Actions area -->
      <div class="flex items-center gap-1 pr-3">
        <button
          type="button"
          class="flex items-center justify-center text-white/90 hover:text-white transition-colors p-1.5 rounded hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          title="Check all in group"
          :disabled="groupIsChecking"
          @click="emit('refresh-group', students)"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            class="size-3.5"
            :class="{ 'animate-spin': groupIsChecking }"
          />
        </button>
        <button
          type="button"
          class="flex items-center justify-center text-white/90 hover:text-white p-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          @click="isOpen = !isOpen"
        >
          <UIcon
            name="i-lucide-chevron-down"
            class="flex-shrink-0 size-3.5 transition-transform duration-200"
            :class="{ 'rotate-180': isOpen }"
          />
        </button>
      </div>
    </div>

    <!-- Collapsible body -->
    <div
      v-show="isOpen"
      class="border-t border-neutral-200 dark:border-white/10 accordion-body"
      :class="isOpen ? 'accordion-open' : 'accordion-closed'"
    >
      <StudentStudentsTable
        :key="currentFilter"
        :students="students"
        :current-filter="currentFilter"
        :checking-passports="checkingPassports"
        :disable-virtual-scroll="true"
        @edit="emit('edit', $event)"
        @details="emit('details', $event)"
        @delete="emit('delete', $event)"
        @refresh="emit('refresh', $event)"
        @download-pdf="emit('download-pdf', $event)"
        @toggle-select="(s, c) => emit('toggle-select', s, c)"
        @toggle-pin="emit('toggle-pin', $event)"
        @deselect-all="emit('deselect-group', students)"
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
