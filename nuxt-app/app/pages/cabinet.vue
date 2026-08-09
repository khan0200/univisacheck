<script setup lang="ts">
import type { Student, StatusFilter } from '~/types/student'
import { isApplicationStatus } from '~/utils/visa-status'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const studentsStore = useStudentsStore()
const { removeMany, remove: removeStudent, downloadPdfUrl, setBatchSelected, togglePin } = useStudentsService()
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

async function openDetails(student: Student) {
  detailsStudent.value = student
  detailsModalOpen.value = true

  try {
    const { apiFetch } = useApiFetch()
    const rows = await apiFetch<Student[]>(`/api/students?passport=${encodeURIComponent(student.passport)}`)
    const fullStudent = rows?.[0]
    if (fullStudent && detailsStudent.value?.passport === student.passport) {
      detailsStudent.value.apiResponse = fullStudent.apiResponse
      studentsStore.patchStudent(student.passport, { apiResponse: fullStudent.apiResponse })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Cabinet] Failed to lazy-load student details:', msg)
  }
}

const showDeleteConfirm = ref(false)
const studentToDelete = ref<Student | null>(null)

function promptDelete(student: Student) {
  studentToDelete.value = student
  showDeleteConfirm.value = true
}

async function confirmDeleteStudent() {
  if (!studentToDelete.value) return
  const student = studentToDelete.value
  try {
    await removeStudent(student.passport)
    studentsStore.removeLocal([student.passport])
    if (detailsStudent.value?.passport === student.passport) detailsModalOpen.value = false
    toast.add({ title: 'Student deleted', color: 'primary', icon: 'i-lucide-trash-2', duration: 2500 })
    showDeleteConfirm.value = false
  } catch {
    toast.add({ title: 'Failed to delete student.', color: 'error', icon: 'i-lucide-alert-circle', duration: 2500 })
  }
}

async function handleRefresh(student: Student) {
  try {
    await checkOne(student)
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
    ? studentsStore.filteredStudents.filter(s => s.batchSelected && isApplicationStatus(s.status))
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
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="lg"
          class="h-11 justify-center flex-1 sm:flex-none"
          @click="openAddModal"
        >
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

      <!-- Single-line announcement inside cabinet toolbar -->
      <StudentVisaProcessingBanner />

      <!-- Status tabs — full width on mobile (already grid-cols-4 w-full inside) -->
      <div class="w-full sm:w-auto shrink-0">
        <StudentStatusTabs
          :model-value="studentsStore.currentFilter"
          :counts="studentsStore.counts"
          @update:model-value="setFilter"
        />
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
          :checking-passports="checkingPassports"
          @edit="openEditModal"
          @details="openDetails"
          @delete="promptDelete"
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
      @delete="promptDelete"
      @refresh="handleRefresh"
      @download-pdf="handleDownloadPdf"
    />

    <StudentBulkDeleteModal
      v-model:open="bulkDeleteModalOpen"
      :students="studentsStore.filteredStudents"
      @delete="handleModalBulkDelete"
    />

    <!-- Delete Confirm Modal -->
    <UModal
      :open="showDeleteConfirm"
      title="Delete Student?"
      @update:open="showDeleteConfirm = $event"
    >
      <template #body>
        <p class="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Are you sure you want to delete
          <strong class="text-[var(--color-text-primary)] dark:text-white">{{ studentToDelete?.fullName }}</strong>?
          This action cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            @click="showDeleteConfirm = false"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            @click="confirmDeleteStudent"
          >
            Delete
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
