<script setup lang="ts">
import type { Student, StatusFilter } from '~/types/student'
import { isApplicationStatus, displayStatusText, bucketForStatus } from '~/utils/visa-status'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const studentsStore = useStudentsStore()
const { removeMany, remove: removeStudent, downloadPdfUrl, setBatchSelected, togglePin } = useStudentsService()
const { checkOne, checkMany, cancelJob, checkingPassports } = useVisaCheck()
const toast = useToast()

// Client-only: the students list requires the JWT from localStorage, which
// only exists in the browser — running this during SSR would fetch with no
// Authorization header, get a 401, and useAsyncData would cache that empty
// result for hydration (silently showing "no students" until a manual reload).
//
// The whole loading/empty/table region below is wrapped in <ClientOnly>
// rather than branching on a `pending` ref: any async-derived state here is
// necessarily false/idle during SSR (the fetch never runs server-side) but
// true/pending on the client's first render (the fetch starts during setup),
// so branching template output on it mismatches during hydration no matter
// which ref backs it. <ClientOnly> sidesteps this by rendering the same
// fallback on the server and through the client's hydration pass, only
// swapping to the real content after mount.
useAsyncData('students', () => studentsStore.loadStudents(), { server: false })
const pending = computed(() => studentsStore.isLoading)

const formModalOpen = ref(false)
const editingStudent = ref<Student | null>(null)
const detailsModalOpen = ref(false)
const detailsStudent = ref<Student | null>(null)

function openAddModal() {
  editingStudent.value = null
  formModalOpen.value = true
}

function openEditModal(student: Student) {
  editingStudent.value = student
  formModalOpen.value = true
}

function openDetails(student: Student) {
  detailsStudent.value = student
  detailsModalOpen.value = true
}

async function handleDelete(student: Student) {
  if (!confirm(`Are you sure you want to delete ${student.fullName}?`)) return
  try {
    await removeStudent(student.passport)
    studentsStore.removeLocal([student.passport])
    if (detailsStudent.value?.passport === student.passport) detailsModalOpen.value = false
    toast.add({ title: 'Student deleted', color: 'primary', icon: 'i-lucide-trash-2', duration: 2500 })
  } catch {
    toast.add({ title: 'Failed to delete student.', color: 'error', icon: 'i-lucide-alert-circle', duration: 2500 })
  }
}

function statusToastColor(status: string): 'primary' | 'secondary' | 'error' {
  const bucket = bucketForStatus(status)
  if (bucket === 'approved') return 'primary' // Dark Green
  if (bucket === 'cancelled') return 'error'   // Red
  return 'secondary' // Gold for received, under review, pending
}

function statusToastIcon(status: string): string {
  const bucket = bucketForStatus(status)
  if (bucket === 'approved') return 'i-lucide-check-circle-2'
  if (bucket === 'cancelled') return 'i-lucide-x-circle'
  if (bucket === 'application') return 'i-lucide-clock'
  return 'i-lucide-info'
}

async function handleRefresh(student: Student) {
  try {
    await checkOne(student)
    toast.add({
      title: 'Check Queued',
      description: `Checking visa status for ${student.fullName} has been added to the queue.`,
      color: 'primary',
      icon: 'i-lucide-clock',
      duration: 2500
    })
  } catch {
    toast.add({ title: 'Failed to queue visa check.', color: 'error', icon: 'i-lucide-alert-triangle', duration: 2500 })
  }
}

function handleDownloadPdf(student: Student) {
  if (student.visaType === 'E-Visa') {
    toast.add({
      title: 'E-Visa PDF',
      description: 'E-Visa certificates are issued directly by the university. Please ask the university for the PDF.',
      color: 'secondary',
      icon: 'i-lucide-file-text',
      duration: 2500
    })
    return
  }
  window.open(downloadPdfUrl(student), '_blank')
}

async function handleToggleSelect(student: Student, checked: boolean) {
  student.batchSelected = checked
  const bucket = studentsStore.currentFilter
  if (bucket === 'cancelled' || bucket === 'approved') return

  try {
    await setBatchSelected(student.passport, checked)
  } catch {
    student.batchSelected = !checked
    toast.add({ title: 'Failed to save selection.', color: 'error', duration: 2500 })
  }
}

async function handleTogglePin(student: Student) {
  const newPinned = !student.pinned
  // Optimistic update
  student.pinned = newPinned
  studentsStore.upsertLocal(student)
  try {
    await togglePin(student.passport, newPinned)
  } catch {
    student.pinned = !newPinned // Revert
    studentsStore.upsertLocal(student)
    toast.add({ title: 'Failed to update pin status', color: 'error', duration: 2500 })
  }
}

const selectedApplicationStudents = computed(() =>
  studentsStore.currentFilter === 'application'
    ? studentsStore.filteredStudents.filter((s) => s.batchSelected && isApplicationStatus(s.status))
    : []
)

const bulkDeleteModalOpen = ref(false)

const batchChecking = ref(false)
async function handleBatchCheck() {
  const list = [...selectedApplicationStudents.value]
  if (list.length === 0) return
  batchChecking.value = true
  try {
    await checkMany(list)
    toast.add({
      title: 'Batch Check Queued',
      description: `Queued ${list.length} student check(s). Progress will update in real-time.`,
      color: 'primary',
      icon: 'i-lucide-clock',
      duration: 3000
    })
  } catch {
    toast.add({ title: 'Batch check failed. Please try again.', color: 'error', duration: 2500 })
  } finally {
    batchChecking.value = false
  }
}

async function handleModalBulkDelete(passports: string[]) {
  if (passports.length === 0) return
  if (!confirm(`Are you sure you want to delete ${passports.length} student(s)?`)) return

  try {
    await removeMany(passports)
    studentsStore.removeLocal(passports)
    bulkDeleteModalOpen.value = false
    toast.add({ title: `Deleted ${passports.length} student(s)`, color: 'primary', duration: 2500 })
  } catch {
    toast.add({ title: 'Failed to delete selected students.', color: 'error', duration: 2500 })
  }
}

function setFilter(filter: StatusFilter) {
  studentsStore.setFilter(filter)
}
</script>

<template>
  <div class="space-y-5 min-w-0">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
      <!-- Action buttons — full width row on mobile -->
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <UButton icon="i-lucide-plus" color="primary" size="lg" class="h-11 justify-center flex-1 sm:flex-none" @click="openAddModal">
          Add Student
        </UButton>
        <UButton
          v-if="studentsStore.currentFilter === 'cancelled' || studentsStore.currentFilter === 'approved' || studentsStore.currentFilter === 'pending'"
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          size="lg"
          class="h-11 justify-center flex-1 sm:flex-none"
          title="Bulk delete"
          @click="bulkDeleteModalOpen = true"
        >
          Delete
        </UButton>

        <UiLoadingButton
          v-if="selectedApplicationStudents.length > 0"
          color="primary"
          size="lg"
          class="h-11 justify-center flex-1 sm:flex-none"
          :loading="batchChecking"
          @click="handleBatchCheck"
        >
          Check ({{ selectedApplicationStudents.length }})
        </UiLoadingButton>
      </div>

      <!-- Status tabs — full width on mobile (already grid-cols-4 w-full inside) -->
      <div class="w-full sm:w-auto shrink-0">
        <StudentStatusTabs :model-value="studentsStore.currentFilter" :counts="studentsStore.counts" @update:model-value="setFilter" />
      </div>
    </div>

    <!-- Job Queue Progress Indicator -->
    <ClientOnly>
      <div
        v-if="studentsStore.activeJob"
        class="bg-primary-900/5 dark:bg-white/5 border border-primary-900/10 dark:border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-loader-2" class="animate-spin size-5 text-primary-600 dark:text-primary-400 shrink-0" />
          <div>
            <h4 class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white">
              Checking visa statuses...
            </h4>
            <p class="text-xs text-[var(--color-text-secondary)] dark:text-neutral-400 mt-0.5">
              {{ studentsStore.activeJob.progress.completed + studentsStore.activeJob.progress.failed }}/{{ studentsStore.activeJob.total }} students checked (concurrency controlled)
            </p>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="flex-1 max-w-md bg-neutral-200 dark:bg-white/10 h-2.5 rounded-full overflow-hidden">
          <div
            class="bg-primary-600 dark:bg-primary-400 h-full rounded-full transition-all duration-300"
            :style="{ width: `${((studentsStore.activeJob.progress.completed + studentsStore.activeJob.progress.failed) / studentsStore.activeJob.total) * 100}%` }"
          />
        </div>

        <UButton
          color="neutral"
          variant="subtle"
          size="sm"
          icon="i-lucide-x"
          @click="cancelJob(studentsStore.activeJob.jobId)"
        >
          Cancel
        </UButton>
      </div>
    </ClientOnly>

    <UCard :ui="{ root: 'shadow-[0_8px_30px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.7)] border border-neutral-300 dark:border-white/20 ring-1 ring-black/5 dark:ring-white/10 rounded-xl overflow-hidden', body: 'p-0 sm:p-0' }">
      <ClientOnly>
        <UiTableSkeleton v-if="pending" />
        <UiEmptyState
          v-else-if="studentsStore.filteredStudents.length === 0"
          icon="i-lucide-inbox"
          title="No students found"
          description="Try adjusting your search or add a new student to get started."
        />
        <StudentStudentsTable
          v-else
          :students="studentsStore.filteredStudents"
          :current-filter="studentsStore.currentFilter"
          :checking-passports="checkingPassports"
          @edit="openEditModal"
          @details="openDetails"
          @delete="handleDelete"
          @refresh="handleRefresh"
          @download-pdf="handleDownloadPdf"
          @toggle-select="handleToggleSelect"
          @toggle-pin="handleTogglePin"
        />
        <template #fallback>
          <UiTableSkeleton />
        </template>
      </ClientOnly>
    </UCard>

    <DashboardTelegramBotBanner />

    <StudentFormModal
      v-model:open="formModalOpen"
      :editing-student="editingStudent"
    />
    <StudentDetailsModal
      v-model:open="detailsModalOpen"
      :student="detailsStudent"
      :checking="detailsStudent ? checkingPassports.has(detailsStudent.passport) : false"
      @edit="openEditModal"
      @delete="handleDelete"
      @refresh="handleRefresh"
      @download-pdf="handleDownloadPdf"
    />

    <StudentBulkDeleteModal
      v-model:open="bulkDeleteModalOpen"
      :students="studentsStore.filteredStudents"
      @delete="handleModalBulkDelete"
    />
  </div>
</template>
