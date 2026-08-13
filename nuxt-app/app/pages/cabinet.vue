<script setup lang="ts">
import type { Student, StatusFilter } from '~/types/student'
import { isApplicationStatus, bucketForStatus } from '~/utils/visa-status'

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
useLazyAsyncData('students', () => studentsStore.loadStudents(), { server: false })
const pending = computed(() => studentsStore.isLoading)

const formModalOpen = useState('addStudentModalOpen', () => false)
const editingStudent = useState<Student | null>('editingStudent', () => null)
const detailsModalOpen = ref(false)
const detailsStudent = ref<Student | null>(null)

const sortMenuItems = computed(() => [
  [
    { label: 'University', icon: studentsStore.sortBy === 'university' ? 'i-lucide-check' : '', onSelect: () => studentsStore.setSortBy('university') },
    { label: 'Tariff', icon: studentsStore.sortBy === 'tariff' ? 'i-lucide-check' : '', onSelect: () => studentsStore.setSortBy('tariff') },
    { label: 'Date', icon: studentsStore.sortBy === 'applicationDate' ? 'i-lucide-check' : '', onSelect: () => studentsStore.setSortBy('applicationDate') }
  ]
])
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

async function handleGroupRefresh(students: Student[]) {
  if (!students.length) return
  try {
    await checkMany(students)
  } catch {
    toast.add({ title: 'Failed to queue group visa check.', color: 'error', icon: 'i-lucide-alert-triangle', duration: 2500 })
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

const selectedStudentsToCheck = computed(() => {
  const filter = studentsStore.currentFilter
  if (filter === 'application') {
    return studentsStore.filteredStudents.filter(s => s.batchSelected && isApplicationStatus(s.status))
  }
  if (filter === 'pending') {
    return studentsStore.filteredStudents.filter(s => s.batchSelected && bucketForStatus(s.status) === 'pending')
  }
  return []
})

const bulkDeleteModalOpen = ref(false)

const batchChecking = ref(false)
async function handleBatchCheck() {
  const list = [...selectedStudentsToCheck.value]
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

const selectedStudentsCount = computed(() => {
  return selectedStudentsToCheck.value.length
})

const isDeselecting = ref(false)

async function handleDeselectGroup(studentsList: Student[]) {
  const selectedList = studentsList.filter(s => s.batchSelected)
  if (selectedList.length === 0) return

  isDeselecting.value = true
  const passports = selectedList.map(s => s.passport)

  // Optimistic update
  for (const s of selectedList) {
    s.batchSelected = false
  }

  try {
    await setBatchSelected(passports, false)
    toast.add({ title: `Deselected ${passports.length} student(s)`, color: 'primary', icon: 'i-lucide-check-circle', duration: 2500 })
  } catch {
    // Revert optimistic update on failure
    for (const s of selectedList) {
      s.batchSelected = true
    }
    toast.add({ title: 'Failed to deselect students.', color: 'error', duration: 2500 })
  } finally {
    isDeselecting.value = false
  }
}

async function handleDeselectAll() {
  await handleDeselectGroup(selectedStudentsToCheck.value)
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
        <ClientOnly>
          <UDropdownMenu :items="sortMenuItems">
            <UButton
              icon="i-lucide-arrow-down-up"
              color="neutral"
              variant="outline"
              size="lg"
              class="h-11 justify-center flex-1 sm:flex-none bg-white dark:bg-white/[0.05]"
            >
              Sort
            </UButton>
          </UDropdownMenu>
        </ClientOnly>
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
          v-if="selectedStudentsCount > 0"
          size="lg"
          class="h-11 justify-center flex-1 sm:flex-none bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0B4133] font-bold shadow-sm border-0"
          :loading="isDeselecting"
          @click="handleDeselectAll"
        >
          Undo ({{ selectedStudentsCount }})
        </UiLoadingButton>

        <UiLoadingButton
          v-if="selectedStudentsToCheck.length > 0"
          color="primary"
          size="lg"
          class="h-11 justify-center flex-1 sm:flex-none"
          :loading="batchChecking"
          @click="handleBatchCheck"
        >
          Check ({{ selectedStudentsToCheck.length }})
        </UiLoadingButton>
      </div>

      <!-- Status tabs — full width on mobile (already grid-cols-4 w-full inside) -->
      <div class="w-full sm:w-auto shrink-0">
        <StudentStatusTabs
          :model-value="studentsStore.currentFilter"
          :counts="studentsStore.counts"
          @update:model-value="setFilter"
        />
      </div>
    </div>

    <ClientOnly>
      <!-- Grouped list (accordion) when at least one student has the sort field set -->
      <template v-if="!pending && studentsStore.hasAnyGroup">
        <div class="space-y-3">
          <StudentUniversityGroup
            v-for="group in studentsStore.groupedStudents"
            :key="group.groupName"
            :group-name="group.groupName"
            :students="group.students"
            :current-filter="studentsStore.currentFilter"
            :checking-passports="checkingPassports"
            @edit="openEditModal"
            @details="openDetails"
            @delete="promptDelete"
            @refresh="handleRefresh"
            @refresh-group="handleGroupRefresh"
            @download-pdf="handleDownloadPdf"
            @toggle-select="handleToggleSelect"
            @toggle-pin="handleTogglePin"
            @deselect-group="handleDeselectGroup"
          />
        </div>
      </template>

      <!-- Flat table / skeleton / empty — wrapped in a card -->
      <UCard
        v-else
        :ui="{ root: 'shadow-[0_8px_30px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.7)] border border-neutral-300 dark:border-white/20 ring-1 ring-black/5 dark:ring-white/10 rounded-xl overflow-hidden', body: 'p-0 sm:p-0' }"
      >
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
          @deselect-all="handleDeselectAll"
        />
      </UCard>

      <template #fallback>
        <UCard :ui="{ root: 'shadow-[0_8px_30px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.7)] border border-neutral-300 dark:border-white/20 ring-1 ring-black/5 dark:ring-white/10 rounded-xl overflow-hidden', body: 'p-0 sm:p-0' }">
          <UiTableSkeleton />
        </UCard>
      </template>
    </ClientOnly>

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

    <StudentChangeReportModal />
  </div>
</template>
