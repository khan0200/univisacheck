<script setup lang="ts">
import type { Student } from '~/types/student'
import { formatTimestampCompact } from '~/utils/format'
import { formatCancellationReason, getCancellationReason, getStatusDate } from '~/utils/visa-status'

const props = defineProps<{
  students: Student[]
  currentFilter: string
  bulkDeleteMode: boolean
  checkingPassports: Set<string>
}>()

const emit = defineEmits<{
  edit: [student: Student]
  details: [student: Student]
  delete: [student: Student]
  refresh: [student: Student]
  'download-pdf': [student: Student]
  'toggle-select': [student: Student, checked: boolean]
}>()

const showSelectColumn = computed(() =>
  props.currentFilter === 'application' ||
  ((props.currentFilter === 'cancelled' || props.currentFilter === 'approved') && props.bulkDeleteMode)
)

const showAppliedColumn = computed(() => props.currentFilter !== 'pending')

const showPdfColumn = computed(() =>
  props.currentFilter === 'approved' ||
  props.students.some((s) => {
    const status = (s.status || '').toLowerCase()
    return status.includes('approved') || status.includes('visa used')
  })
)

function isPdfEligible(student: Student) {
  const status = (student.status || '').toLowerCase()
  return status.includes('approved') || status.includes('visa used')
}

const showStatusDateColumn = computed(() => props.currentFilter === 'approved')

const MIN_DAYS_SINCE_APPLIED = 9

function daysSinceApplied(student: Student): number {
  if (!student.applicationDate) return 0
  const applied = new Date(student.applicationDate).getTime()
  if (Number.isNaN(applied)) return 0
  return Math.floor((Date.now() - applied) / (1000 * 60 * 60 * 24))
}

function isSelectable(student: Student): boolean {
  if (props.currentFilter !== 'application') return true
  return daysSinceApplied(student) >= MIN_DAYS_SINCE_APPLIED
}

function onRowClick(student: Student, event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('button, input, select, a')) return

  const isBulkSelectable = props.bulkDeleteMode && (props.currentFilter === 'cancelled' || props.currentFilter === 'approved')
  if (isBulkSelectable) {
    emit('toggle-select', student, !student.batchSelected)
    return
  }

  emit('details', student)
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="sticky top-0 z-10 bg-white/95 dark:bg-[var(--color-card-dark)]/95 backdrop-blur">
        <tr class="border-b border-[var(--color-border)] dark:border-white/[0.08] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          <th class="px-4 py-3">Name</th>
          <th class="px-4 py-3">Passport</th>
          <th class="px-4 py-3">Status</th>
          <th v-if="showAppliedColumn" class="px-4 py-3">Applied</th>
          <th v-if="showStatusDateColumn" class="px-4 py-3">Status Date</th>
          <th v-else class="px-4 py-3">Checked</th>
          <th v-if="showSelectColumn" class="px-4 py-3 text-center">Select</th>
          <th v-if="showPdfColumn" class="px-4 py-3 text-center">PDF</th>
          <th class="px-4 py-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--color-border)] dark:divide-white/[0.06]">
        <tr
          v-for="student in props.students"
          :key="student.passport"
          class="cursor-pointer transition-colors hover:bg-primary-50/60 dark:hover:bg-white/[0.03]"
          @click="onRowClick(student, $event)"
        >
          <td class="px-4 py-3 align-top">
            <div class="font-bold text-[var(--color-text-primary)] dark:text-white">
              <UiCopyField :value="student.fullName" label="Copy full name" :copy-id="`name-${student.passport}`" />
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mt-1">
              <StudentVisaTypeBadge :visa-type="student.visaType" />
              <span v-if="student.studentId" class="text-xs text-[var(--color-text-secondary)]">
                <UiCopyField :value="student.studentId" label="Copy student ID" :copy-id="`sid-${student.passport}`">
                  #{{ student.studentId }}
                </UiCopyField>
              </span>
              <span v-if="student.applicationNo" class="text-xs text-[var(--color-text-secondary)]">
                <UiCopyField :value="student.applicationNo" label="Copy application number" :copy-id="`appno-${student.passport}`" />
              </span>
            </div>
            <p v-if="getCancellationReason(student)" class="text-xs text-danger-600 mt-1 max-w-xs leading-snug">
              Rejected: {{ formatCancellationReason(getCancellationReason(student)) }}
            </p>
          </td>
          <td class="px-4 py-3 align-top whitespace-nowrap">
            <div class="font-bold text-[var(--color-text-primary)] dark:text-white">
              <UiCopyField :value="student.passport" label="Copy passport number" :copy-id="`pp-${student.passport}`" />
            </div>
            <div class="text-xs font-bold text-[var(--color-text-secondary)] mt-0.5">
              <UiCopyField :value="student.birthday" label="Copy birthdate" :copy-id="`bd-${student.passport}`" />
            </div>
          </td>
          <td class="px-4 py-3 align-top">
            <StudentStatusBadge :status="student.status" />
          </td>
          <td v-if="showAppliedColumn" class="px-4 py-3 align-top whitespace-nowrap">
            <UiCopyField :value="student.applicationDate" label="Copy applied date" :copy-id="`ad-${student.passport}`">
              {{ student.applicationDate || '--' }}
            </UiCopyField>
          </td>
          <td v-if="showStatusDateColumn" class="px-4 py-3 align-top whitespace-nowrap text-[var(--color-text-secondary)]">
            {{ getStatusDate(student) || '--' }}
          </td>
          <td v-else class="px-4 py-3 align-top whitespace-nowrap text-[var(--color-text-secondary)]">
            <span v-if="checkingPassports.has(student.passport)" class="inline-flex items-center gap-1">
              <span class="h-3 w-16 rounded-full bg-neutral-200/70 dark:bg-white/10 animate-pulse" />
            </span>
            <span v-else>{{ formatTimestampCompact(student.lastChecked) }}</span>
          </td>
          <td v-if="showSelectColumn" class="px-4 py-3 align-top text-center">
            <input
              type="checkbox"
              class="size-4 rounded border-neutral-300 text-primary-700 focus:ring-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
              :checked="Boolean(student.batchSelected)"
              :disabled="!(currentFilter === 'application' || ((currentFilter === 'cancelled' || currentFilter === 'approved') && bulkDeleteMode)) || !isSelectable(student)"
              :title="!isSelectable(student) ? `Selectable ${MIN_DAYS_SINCE_APPLIED} days after application date` : undefined"
              @change="emit('toggle-select', student, ($event.target as HTMLInputElement).checked)"
            >
          </td>
          <td v-if="showPdfColumn" class="px-4 py-3 align-top text-center">
            <button
              v-if="isPdfEligible(student)"
              type="button"
              class="text-primary-700 dark:text-secondary-300 hover:text-primary-900 dark:hover:text-white transition-colors"
              :class="{ 'text-warning-600 dark:text-warning-400': student.visaType === 'E-Visa' }"
              :title="student.visaType === 'E-Visa' ? 'E-Visa PDF: request from university' : 'Download Visa PDF'"
              @click="emit('download-pdf', student)"
            >
              <UIcon :name="student.visaType === 'E-Visa' ? 'i-lucide-info' : 'i-lucide-file-down'" class="size-5" />
            </button>
          </td>
          <td class="px-4 py-3 align-top">
            <div class="flex items-center justify-end gap-1.5">
              <UiLoadingButton
                size="sm"
                color="primary"
                :loading="checkingPassports.has(student.passport)"
                @click="emit('refresh', student)"
              >
                Check
              </UiLoadingButton>
              <UButton
                icon="i-lucide-pencil"
                size="sm"
                color="neutral"
                variant="ghost"
                square
                :ui="{ leadingIcon: 'size-5' }"
                aria-label="Edit"
                @click="emit('edit', student)"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="sm"
                color="error"
                variant="ghost"
                square
                :ui="{ leadingIcon: 'size-5' }"
                aria-label="Delete"
                @click="emit('delete', student)"
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
