<script setup lang="ts">
import type { Student } from '~/types/student'
import { formatTimestamp } from '~/utils/format'
import { getCancellationReason, getStatusDate } from '~/utils/visa-status'

const props = defineProps<{
  open: boolean
  student: Student | null
  checking?: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  edit: [student: Student]
  delete: [student: Student]
  refresh: [student: Student]
  'download-pdf': [student: Student]
}>()

const { copyValue, isCopied } = useCopyField()

const reason = computed(() => (props.student ? getCancellationReason(props.student) : ''))
const statusDate = computed(() => (props.student ? getStatusDate(props.student) : ''))

const isPdfEligible = computed(() => {
  const status = (props.student?.status || '').toLowerCase()
  return status.includes('approved') || status.includes('visa used')
})

function handleRefresh() {
  if (props.student) emit('refresh', props.student)
}
function handleEdit() {
  if (props.student) {
    emit('edit', props.student)
    emit('update:open', false)
  }
}
function handleDelete() {
  if (props.student) emit('delete', props.student)
}
function handleDownloadPdf() {
  if (props.student) emit('download-pdf', props.student)
}
</script>

<template>
  <UModal :open="props.open" title="Student Details" @update:open="emit('update:open', $event)">
    <template #body>
      <div v-if="props.student" class="space-y-5">
        <button
          type="button"
          class="w-full text-left group/name cursor-pointer"
          @click="copyValue(props.student.fullName, 'modal-fullname')"
        >
          <span class="flex items-center gap-1.5">
            <h3 class="font-semibold text-[var(--color-text-primary)] dark:text-white truncate">{{ props.student.fullName }}</h3>
            <UIcon
              :name="isCopied('modal-fullname') ? 'i-lucide-check' : 'i-lucide-copy'"
              class="size-3.5 shrink-0"
              :class="isCopied('modal-fullname') ? 'text-success-500' : 'text-[var(--color-text-secondary)] group-hover/name:text-primary-700 dark:group-hover/name:text-secondary-300'"
            />
          </span>
          <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
            <StudentVisaTypeBadge :visa-type="props.student.visaType" />
            <StudentStatusBadge :status="props.student.status" />
          </div>
        </button>

        <button
          type="button"
          class="w-full flex items-center justify-between gap-3 rounded-xl bg-primary-50 dark:bg-white/5 px-4 py-3 text-left hover:bg-primary-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          @click="copyValue(props.student.passport, 'modal-passport')"
        >
          <div class="min-w-0">
            <p class="text-[10.5px] font-semibold uppercase tracking-wide text-primary-700 dark:text-secondary-300">Passport Number</p>
            <p class="text-base font-bold tracking-wide text-primary-950 dark:text-white truncate">{{ props.student.passport }}</p>
          </div>
          <UIcon
            :name="isCopied('modal-passport') ? 'i-lucide-check' : 'i-lucide-copy'"
            class="size-4.5 shrink-0"
            :class="isCopied('modal-passport') ? 'text-success-500' : 'text-primary-700 dark:text-secondary-300'"
          />
        </button>

        <div class="grid grid-cols-2 gap-3">
          <StudentDetailCopyCell label="Student ID" :value="props.student.studentId" copy-id="modal-studentid" />
          <StudentDetailCopyCell label="Birthdate" :value="props.student.birthday" copy-id="modal-birthday" bold />
          <StudentDetailCopyCell label="Application Date" :value="props.student.applicationDate" copy-id="modal-appdate" />
          <StudentDetailCopyCell
            v-if="props.student.visaType === 'E-Visa'"
            label="Application Number"
            :value="props.student.applicationNo"
            copy-id="modal-appno"
          />
          <StudentDetailCopyCell v-if="statusDate" label="Status Date" :value="statusDate" copy-id="modal-statusdate" />
          <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3" :class="{ 'col-span-2': props.student.visaType !== 'E-Visa' && !statusDate }">
            <p class="text-xs text-[var(--color-text-secondary)] mb-1">Last Checked</p>
            <p class="text-sm font-medium">{{ formatTimestamp(props.student.lastChecked) }}</p>
          </div>
        </div>

        <div v-if="reason" class="flex items-start gap-2.5 rounded-xl bg-danger-50 dark:bg-danger-950/30 border border-danger-200 dark:border-danger-900 p-3">
          <UIcon name="i-lucide-triangle-alert" class="size-4 text-danger-600 shrink-0 mt-0.5" />
          <p class="text-xs text-danger-700 dark:text-danger-300 leading-relaxed">{{ reason }}</p>
        </div>
      </div>
    </template>
    <template v-if="props.student" #footer>
      <div class="grid grid-cols-3 w-full gap-2">
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          aria-label="Delete"
          block
          @click="handleDelete"
        >
          Delete
        </UButton>
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
          block
          @click="handleEdit"
        >
          Edit
        </UButton>
        <UButton
          v-if="isPdfEligible"
          :icon="props.student.visaType === 'E-Visa' ? 'i-lucide-info' : 'i-lucide-file-down'"
          color="primary"
          block
          @click="handleDownloadPdf"
        >
          PDF
        </UButton>
        <UiLoadingButton
          v-else
          icon="i-lucide-refresh-cw"
          color="primary"
          :loading="props.checking"
          block
          @click="handleRefresh"
        >
          Check
        </UiLoadingButton>
      </div>
    </template>
  </UModal>
</template>
