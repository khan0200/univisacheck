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
  'edit': [student: Student]
  'delete': [student: Student]
  'refresh': [student: Student]
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

// ── Dropdown selection logic ──────────────────────────────────────────────────
const { apiFetch } = useApiFetch()
const studentsStore = useStudentsStore()
const toast = useToast()

const tariffsList = ref<{ name: string }[]>([])
const universitiesList = ref<{ name: string }[]>([])
const coordinatorsList = ref<{ name: string }[]>([])

const selectedTariff = ref(props.student?.tariff || 'none')
const selectedUniversity = ref(props.student?.university || 'none')
const selectedCoordinator = ref(props.student?.coordinator || 'none')

const editingTariff = ref(false)
const editingUniversity = ref(false)
const editingCoordinator = ref(false)

async function loadOptions() {
  try {
    const [t, u, c] = await Promise.all([
      apiFetch<{ name: string }[]>('/api/settings/tariffs'),
      apiFetch<{ name: string }[]>('/api/settings/universities'),
      apiFetch<{ name: string }[]>('/api/settings/coordinators')
    ])
    tariffsList.value = t || []
    universitiesList.value = u || []
    coordinatorsList.value = c || []
  } catch (err) {
    console.error('Failed to load dropdown options in details modal:', err)
  }
}

watch(() => props.open, (open) => {
  if (open) {
    loadOptions()
    selectedTariff.value = props.student?.tariff || 'none'
    selectedUniversity.value = props.student?.university || 'none'
    selectedCoordinator.value = props.student?.coordinator || 'none'
  }
  editingTariff.value = false
  editingUniversity.value = false
  editingCoordinator.value = false
})

watch(() => props.student, (newStudent) => {
  selectedTariff.value = newStudent?.tariff || 'none'
  selectedUniversity.value = newStudent?.university || 'none'
  selectedCoordinator.value = newStudent?.coordinator || 'none'
}, { deep: true })

const tariffOptions = computed(() => {
  const uniqueNames = [...new Set(tariffsList.value.map(t => t.name))]
  const list = uniqueNames.map(name => ({ value: name, label: name }))
  return [{ value: 'none', label: 'None' }, ...list]
})

const universityOptions = computed(() => {
  const uniqueNames = [...new Set(universitiesList.value.map(u => u.name))]
  const list = uniqueNames.map(name => ({ value: name, label: name }))
  return [{ value: 'none', label: 'None' }, ...list]
})

const coordinatorOptions = computed(() => {
  const uniqueNames = [...new Set(coordinatorsList.value.map(c => c.name))]
  const list = uniqueNames.map(name => ({ value: name, label: name }))
  return [{ value: 'none', label: 'None' }, ...list]
})

async function saveField(fieldName: 'tariff' | 'university' | 'coordinator', value: string) {
  if (!props.student) return
  const apiValue = value === 'none' ? '' : value
  try {
    await apiFetch('/api/students', {
      method: 'PATCH',
      body: {
        passport: props.student.passport,
        [fieldName]: apiValue
      }
    })
    studentsStore.patchStudent(props.student.passport, { [fieldName]: apiValue })
    toast.add({ title: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} updated!`, color: 'success' })
    if (fieldName === 'tariff') editingTariff.value = false
    if (fieldName === 'university') editingUniversity.value = false
    if (fieldName === 'coordinator') editingCoordinator.value = false
  } catch (err: unknown) {
    toast.add({ title: apiErrorMessage(err, `Failed to update ${fieldName}`), color: 'error' })
  }
}

function cancelEdit(fieldName: 'tariff' | 'university' | 'coordinator') {
  if (fieldName === 'tariff') {
    selectedTariff.value = props.student?.tariff || 'none'
    editingTariff.value = false
  } else if (fieldName === 'university') {
    selectedUniversity.value = props.student?.university || 'none'
    editingUniversity.value = false
  } else if (fieldName === 'coordinator') {
    selectedCoordinator.value = props.student?.coordinator || 'none'
    editingCoordinator.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Student Details"
    :ui="{ content: 'sm:max-w-3xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="props.student"
        class="grid grid-cols-1 md:grid-cols-2 gap-8"
      >
        <!-- Left Column: Student Details -->
        <div class="space-y-5">
          <button
            type="button"
            class="w-full text-left group/name cursor-pointer"
            @click="copyValue(props.student.fullName, 'modal-fullname')"
          >
            <span class="flex items-center gap-1.5">
              <h3 class="font-semibold text-[var(--color-text-primary)] dark:text-white truncate">
                {{ props.student.fullName }}
              </h3>
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
              <p class="text-[10.5px] font-semibold uppercase tracking-wide text-primary-700 dark:text-secondary-300">
                Passport Number
              </p>
              <p class="text-base font-bold tracking-wide text-primary-950 dark:text-white truncate">
                {{ props.student.passport }}
              </p>
            </div>
            <UIcon
              :name="isCopied('modal-passport') ? 'i-lucide-check' : 'i-lucide-copy'"
              class="size-4.5 shrink-0"
              :class="isCopied('modal-passport') ? 'text-success-500' : 'text-primary-700 dark:text-secondary-300'"
            />
          </button>

          <div class="grid grid-cols-2 gap-3">
            <StudentDetailCopyCell
              label="Student ID"
              :value="props.student.studentId"
              copy-id="modal-studentid"
            />
            <StudentDetailCopyCell
              label="Birthdate"
              :value="props.student.birthday"
              copy-id="modal-birthday"
              bold
            />
            <StudentDetailCopyCell
              label="Application Date"
              :value="props.student.applicationDate"
              copy-id="modal-appdate"
            />
            <StudentDetailCopyCell
              v-if="props.student.visaType === 'E-Visa'"
              label="Application Number"
              :value="props.student.applicationNo"
              copy-id="modal-appno"
            />
            <StudentDetailCopyCell
              v-if="statusDate"
              label="Status Date"
              :value="statusDate"
              copy-id="modal-statusdate"
            />
            <div
              class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3"
              :class="{ 'col-span-2': props.student.visaType !== 'E-Visa' && !statusDate }"
            >
              <p class="text-xs text-[var(--color-text-secondary)] mb-1">
                Last Checked
              </p>
              <p class="text-sm font-medium">
                {{ formatTimestamp(props.student.lastChecked) }}
              </p>
            </div>
          </div>

          <div
            v-if="reason"
            class="flex items-start gap-2.5 rounded-xl bg-danger-50 dark:bg-danger-950/30 border border-danger-200 dark:border-danger-900 p-3"
          >
            <UIcon
              name="i-lucide-triangle-alert"
              class="size-4 text-danger-600 shrink-0 mt-0.5"
            />
            <p class="text-xs text-danger-700 dark:text-danger-300 leading-relaxed">
              {{ reason }}
            </p>
          </div>
        </div>

        <!-- Right Column: Management Selection Dropdowns -->
        <div class="space-y-4 border-t md:border-t-0 md:border-l border-[var(--color-border)] dark:border-white/[0.08] pt-4.5 md:pt-0 md:pl-6">
          <p class="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Management
          </p>
          <div class="space-y-4">
            <!-- Tariff Field -->
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Tariff
              </label>
              <div
                v-if="!editingTariff"
                class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]"
              >
                <span class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white truncate pr-2">
                  {{ props.student?.tariff || 'None' }}
                </span>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    aria-label="Edit Tariff"
                    @click="editingTariff = true"
                  />
                  <UButton
                    v-if="props.student?.tariff"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="error"
                    size="sm"
                    aria-label="Clear Tariff"
                    @click="saveField('tariff', 'none')"
                  />
                </div>
              </div>
              <div
                v-else
                class="flex items-center gap-2"
              >
                <USelect
                  v-model="selectedTariff"
                  :items="tariffOptions"
                  value-key="value"
                  label-key="label"
                  class="flex-1 min-w-0"
                  placeholder="Choose Tariff"
                />
                <UButton
                  icon="i-lucide-check"
                  variant="ghost"
                  color="success"
                  size="sm"
                  class="shrink-0"
                  aria-label="Save Tariff"
                  @click="saveField('tariff', selectedTariff)"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  class="shrink-0"
                  aria-label="Cancel editing"
                  @click="cancelEdit('tariff')"
                />
              </div>
            </div>

            <!-- University Field -->
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                University
              </label>
              <div
                v-if="!editingUniversity"
                class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]"
              >
                <span class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white truncate pr-2">
                  {{ props.student?.university || 'None' }}
                </span>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    aria-label="Edit University"
                    @click="editingUniversity = true"
                  />
                  <UButton
                    v-if="props.student?.university"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="error"
                    size="sm"
                    aria-label="Clear University"
                    @click="saveField('university', 'none')"
                  />
                </div>
              </div>
              <div
                v-else
                class="flex items-center gap-2"
              >
                <USelectMenu
                  v-model="selectedUniversity"
                  :items="universityOptions"
                  value-key="value"
                  label-key="label"
                  class="flex-1 min-w-0"
                  placeholder="Choose University"
                />
                <UButton
                  icon="i-lucide-check"
                  variant="ghost"
                  color="success"
                  size="sm"
                  class="shrink-0"
                  aria-label="Save University"
                  @click="saveField('university', selectedUniversity)"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  class="shrink-0"
                  aria-label="Cancel editing"
                  @click="cancelEdit('university')"
                />
              </div>
            </div>

            <!-- Coordinator Field -->
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Coordinator
              </label>
              <div
                v-if="!editingCoordinator"
                class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]"
              >
                <span class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white truncate pr-2">
                  {{ props.student?.coordinator || 'None' }}
                </span>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    aria-label="Edit Coordinator"
                    @click="editingCoordinator = true"
                  />
                  <UButton
                    v-if="props.student?.coordinator"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="error"
                    size="sm"
                    aria-label="Clear Coordinator"
                    @click="saveField('coordinator', 'none')"
                  />
                </div>
              </div>
              <div
                v-else
                class="flex items-center gap-2"
              >
                <USelect
                  v-model="selectedCoordinator"
                  :items="coordinatorOptions"
                  value-key="value"
                  label-key="label"
                  class="flex-1 min-w-0"
                  placeholder="Choose Coordinator"
                />
                <UButton
                  icon="i-lucide-check"
                  variant="ghost"
                  color="success"
                  size="sm"
                  class="shrink-0"
                  aria-label="Save Coordinator"
                  @click="saveField('coordinator', selectedCoordinator)"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  class="shrink-0"
                  aria-label="Cancel editing"
                  @click="cancelEdit('coordinator')"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template
      v-if="props.student"
      #footer
    >
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
