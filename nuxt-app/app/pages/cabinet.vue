<script setup lang="ts">
import type { Student, StatusFilter } from '~/types/student'
import { isApplicationStatus } from '~/utils/visa-status'

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
    toast.add({ title: 'Student deleted', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to delete student.', color: 'error' })
  }
}

async function handleRefresh(student: Student) {
  try {
    await checkOne(student)
    studentsStore.upsertLocal(student)
  } catch {
    toast.add({ title: 'Error checking visa status.', color: 'error' })
  }
}

function handleDownloadPdf(student: Student) {
  if (student.visaType === 'E-Visa') {
    toast.add({
      title: 'E-Visa PDF',
      description: 'E-Visa certificates are issued directly by the university. Please ask the university for the PDF.',
      color: 'warning'
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
    toast.add({ title: 'Failed to save selection.', color: 'error' })
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
    toast.add({ title: `Checked ${list.length} student(s)`, color: 'success' })
  } catch {
    toast.add({ title: 'Batch check failed. Please try again.', color: 'error' })
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
    toast.add({ title: `Deleted ${passports.length} student(s)`, color: 'success' })
  } catch {
    toast.add({ title: 'Failed to delete selected students.', color: 'error' })
  } finally {
    batchDeleting.value = false
  }
}

function setFilter(filter: StatusFilter) {
  studentsStore.setFilter(filter)
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col lg:flex-row lg:items-center gap-3">
      <UButton icon="i-lucide-plus" color="primary" @click="openAddModal">
        Add Student
      </UButton>

      <UInput
        v-model="studentsStore.searchQuery"
        icon="i-lucide-search"
        placeholder="Search students…"
        class="w-full lg:max-w-xs"
      />

      <UiLoadingButton
        v-if="selectedApplicationStudents.length > 0"
        color="primary"
        :loading="batchChecking"
        @click="handleBatchCheck"
      >
        Check ({{ selectedApplicationStudents.length }})
      </UiLoadingButton>
      <UiLoadingButton
        v-if="selectedDeleteStudents.length > 0"
        color="error"
        icon="i-lucide-trash-2"
        :loading="batchDeleting"
        @click="handleBatchDelete"
      >
        Delete ({{ selectedDeleteStudents.length }})
      </UiLoadingButton>

      <div class="lg:ml-auto">
        <StudentStatusTabs :model-value="studentsStore.currentFilter" :counts="studentsStore.counts" @update:model-value="setFilter" />
      </div>
    </div>

    <UCard :ui="{ root: 'shadow-[0_4px_16px_rgba(16,24,40,0.08),0_1px_3px_rgba(16,24,40,0.06)]', body: 'p-0 sm:p-0' }">
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
