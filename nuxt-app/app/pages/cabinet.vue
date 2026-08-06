<script setup lang="ts">
import type { Student, StatusFilter } from '~/types/student'
import { isApplicationStatus, displayStatusText, bucketForStatus } from '~/utils/visa-status'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const studentsStore = useStudentsStore()
const { removeMany, remove: removeStudent, downloadPdfUrl, setBatchSelected } = useStudentsService()
const { checkOne, checkMany, checkingPassports } = useVisaCheck()
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
const refresh = () => studentsStore.loadStudents()

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
  const bucket = studentsStore.currentFilter
  if (bucket === 'cancelled' || bucket === 'approved') {
    studentsStore.bulkDeleteMode = true
    student.batchSelected = true
    return
  }

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
  const oldStatus = student.status || 'Pending'
  try {
    const changed = await checkOne(student)
    studentsStore.upsertLocal(student)
    const newStatus = student.status || 'Unknown'

    if (changed) {
      toast.add({
        title: `${student.fullName}`,
        description: `${displayStatusText(oldStatus)} → ${displayStatusText(newStatus)}`,
        color: statusToastColor(newStatus),
        icon: statusToastIcon(newStatus),
        duration: 2500
      })
    } else {
      toast.add({
        title: `${student.fullName}`,
        description: `Status: ${displayStatusText(newStatus)} (no change)`,
        color: 'secondary',
        icon: 'i-lucide-info',
        duration: 2500
      })
    }
  } catch {
    toast.add({ title: 'Error checking visa status.', color: 'error', icon: 'i-lucide-alert-triangle', duration: 2500 })
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

const selectedApplicationStudents = computed(() =>
  studentsStore.currentFilter === 'application'
    ? studentsStore.filteredStudents.filter((s) => s.batchSelected && isApplicationStatus(s.status))
    : []
)

const selectedDeleteStudents = computed(() =>
  (studentsStore.currentFilter === 'cancelled' || studentsStore.currentFilter === 'approved') && studentsStore.bulkDeleteMode
    ? studentsStore.filteredStudents.filter((s) => s.batchSelected)
    : []
)

const batchChecking = ref(false)
async function handleBatchCheck() {
  const list = [...selectedApplicationStudents.value]
  if (list.length === 0) return
  batchChecking.value = true
  try {
    await checkMany(list)
    toast.add({ title: `Checked ${list.length} student(s)`, color: 'primary', duration: 2500 })
  } catch {
    toast.add({ title: 'Batch check failed. Please try again.', color: 'error', duration: 2500 })
  } finally {
    batchChecking.value = false
  }
}

const batchDeleting = ref(false)
async function handleBatchDelete() {
  const passports = selectedDeleteStudents.value.map((s) => s.passport)
  if (passports.length === 0) return
  if (!confirm('Are you sure?')) return

  batchDeleting.value = true
  try {
    await removeMany(passports)
    studentsStore.removeLocal(passports)
    studentsStore.bulkDeleteMode = false
    toast.add({ title: `Deleted ${passports.length} student(s)`, color: 'primary', duration: 2500 })
  } catch {
    toast.add({ title: 'Failed to delete selected students.', color: 'error', duration: 2500 })
  } finally {
    batchDeleting.value = false
  }
}

function setFilter(filter: StatusFilter) {
  studentsStore.setFilter(filter)
}
</script>

<template>
  <div class="space-y-5 min-w-0">
    <div class="flex flex-col lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center gap-3 min-w-0">
      <div class="grid grid-cols-2 lg:flex lg:items-center gap-3 w-full lg:w-auto justify-self-start">
        <UButton icon="i-lucide-plus" color="primary" size="lg" class="h-11 justify-center" @click="openAddModal">
          Add Student
        </UButton>

        <UiLoadingButton
          v-if="selectedApplicationStudents.length > 0"
          color="primary"
          size="lg"
          class="h-11 justify-center"
          :loading="batchChecking"
          @click="handleBatchCheck"
        >
          Check ({{ selectedApplicationStudents.length }})
        </UiLoadingButton>
        <UiLoadingButton
          v-if="selectedDeleteStudents.length > 0"
          color="error"
          icon="i-lucide-trash-2"
          size="lg"
          class="h-11 justify-center"
          :loading="batchDeleting"
          @click="handleBatchDelete"
        >
          Delete ({{ selectedDeleteStudents.length }})
        </UiLoadingButton>
      </div>

      <div class="shrink-0 justify-self-start lg:justify-self-center">
        <StudentVisaTypeFilterTabs
          :model-value="studentsStore.visaTypeFilter"
          :counts="studentsStore.visaTypeCounts"
          @update:model-value="studentsStore.setVisaTypeFilter"
        />
      </div>

      <div class="shrink-0 justify-self-start lg:justify-self-end">
        <StudentStatusTabs :model-value="studentsStore.currentFilter" :counts="studentsStore.counts" @update:model-value="setFilter" />
      </div>
    </div>

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
          :bulk-delete-mode="studentsStore.bulkDeleteMode"
          :checking-passports="checkingPassports"
          @edit="openEditModal"
          @details="openDetails"
          @delete="handleDelete"
          @refresh="handleRefresh"
          @download-pdf="handleDownloadPdf"
          @toggle-select="handleToggleSelect"
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
      @saved="refresh"
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
  </div>
</template>
