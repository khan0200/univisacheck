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

// â”€â”€ Dropdown selection logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { apiFetch } = useApiFetch()
const studentsStore = useStudentsStore()
const toast = useToast()

const tariffsList = ref<{ name: string }[]>([])
const universitiesList = ref<{ name: string }[]>([])
const coordinatorsList = ref<{ name: string }[]>([])
const b2bList = ref<{ name: string }[]>([])

const showEditFieldModal = ref(false)
const editingFieldName = ref<'tariff' | 'university' | 'coordinator' | 'b2b' | 'flag' | null>(null)
const editingFieldValue = ref('none')

async function loadOptions() {
  try {
    const [t, u, c, b] = await Promise.all([
      apiFetch<{ name: string }[]>('/api/settings/tariffs'),
      apiFetch<{ name: string }[]>('/api/settings/universities'),
      apiFetch<{ name: string }[]>('/api/settings/coordinators'),
      apiFetch<{ name: string }[]>('/api/settings/b2b')
    ])
    tariffsList.value = t || []
    universitiesList.value = u || []
    coordinatorsList.value = c || []
    b2bList.value = b || []
  } catch (err) {
    console.error('Failed to load dropdown options in details modal:', err)
  }
}

watch(() => props.open, (open) => {
  if (open) {
    loadOptions()
  }
  showEditFieldModal.value = false
})

function openEditField(fieldName: 'tariff' | 'university' | 'coordinator' | 'b2b' | 'flag') {
  editingFieldName.value = fieldName
  if (fieldName === 'tariff') editingFieldValue.value = props.student?.tariff || 'none'
  else if (fieldName === 'university') editingFieldValue.value = props.student?.university || 'none'
  else if (fieldName === 'coordinator') editingFieldValue.value = props.student?.coordinator || 'none'
  else if (fieldName === 'b2b') editingFieldValue.value = props.student?.b2b || 'none'
  else if (fieldName === 'flag') editingFieldValue.value = props.student?.flag ? 'true' : 'false'
  showEditFieldModal.value = true
}

const editingFieldOptions = computed(() => {
  if (editingFieldName.value === 'tariff') return tariffOptions.value
  if (editingFieldName.value === 'university') return universityOptions.value
  if (editingFieldName.value === 'coordinator') return coordinatorOptions.value
  if (editingFieldName.value === 'b2b') return b2bOptions.value
  if (editingFieldName.value === 'flag') return flagOptions.value
  return []
})

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

const b2bOptions = computed(() => {
  const uniqueNames = [...new Set(b2bList.value.map(b => b.name))]
  const list = uniqueNames.map(name => ({ value: name, label: name }))
  return [{ value: 'none', label: 'None' }, ...list]
})

const flagOptions = computed(() => [
  { value: 'true', label: 'True' },
  { value: 'false', label: 'False' }
])

async function saveField(fieldName: 'tariff' | 'university' | 'coordinator' | 'b2b' | 'flag', value: string) {
  if (!props.student) return
  const isFlag = fieldName === 'flag'
  const apiValue = isFlag ? (value === 'true') : (value === 'none' ? '' : value)
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
    showEditFieldModal.value = false
  } catch (err: unknown) {
    toast.add({ title: apiErrorMessage(err, `Failed to update ${fieldName}`), color: 'error' })
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
              <span
                v-if="props.student.flag"
                title="Flagged"
                class="text-sm select-none shrink-0"
              >🚩</span>
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
              v-if="props.student.applicationNo"
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
              :class="{ 'col-span-2': !props.student.applicationNo && !statusDate }"
            >
              <p class="text-xs text-[var(--color-text-secondary)] mb-1">
                Last Checked
              </p>
              <p class="text-sm font-medium flex items-center gap-1.5">
                <span>{{ formatTimestamp(props.student.lastChecked) }}</span>
                <span
                  v-if="props.student.check_source === 'auto' || props.student.checkSource === 'auto'"
                  class="flex items-center gap-1 mt-0.5"
                  title="Automated Visa Check"
                >
                  <span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
                  </span>
                  <span class="text-[10px] font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wider">Auto</span>
                </span>
              </p>
            </div>
          </div>

          <div
            v-if="reason"
            class="rounded-xl p-3 border"
            :class="(props.student?.status || '').toLowerCase().includes('supplement')
              ? 'bg-warning-50 dark:bg-warning-950/30 border-warning-200 dark:border-warning-900'
              : 'bg-danger-50/70 dark:bg-danger-950/30 border-danger-200 dark:border-danger-900'"
          >
            <StudentRejectionReason
              v-if="!(props.student?.status || '').toLowerCase().includes('supplement')"
              :reason="reason"
            />
            <div
              v-else
              class="flex items-start gap-2.5"
            >
              <UIcon
                name="i-lucide-triangle-alert"
                class="size-4 shrink-0 mt-0.5 text-warning-600"
              />
              <p class="text-xs leading-relaxed text-warning-700 dark:text-warning-300">
                {{ reason }}
              </p>
            </div>
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
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]">
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
                    @click="openEditField('tariff')"
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
            </div>

            <!-- University Field -->
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                University
              </label>
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]">
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
                    @click="openEditField('university')"
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
            </div>

            <!-- Coordinator Field -->
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Coordinator
              </label>
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]">
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
                    @click="openEditField('coordinator')"
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
            </div>

            <!-- B2B Field -->
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                B2B Partner
              </label>
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]">
                <span class="text-sm font-semibold text-[var(--color-text-primary)] dark:text-white truncate pr-2">
                  {{ props.student?.b2b || 'None' }}
                </span>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    aria-label="Edit B2B"
                    @click="openEditField('b2b')"
                  />
                  <UButton
                    v-if="props.student?.b2b"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="error"
                    size="sm"
                    aria-label="Clear B2B"
                    @click="saveField('b2b', 'none')"
                  />
                </div>
              </div>
            </div>

            <!-- Flag Field -->
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Flag
              </label>
              <div class="rounded-xl border border-[var(--color-border)] dark:border-white/[0.08] p-3 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.01]">
                <span class="text-sm font-semibold flex items-center gap-1.5 text-[var(--color-text-primary)] dark:text-white truncate pr-2">
                  <span>{{ props.student?.flag ? 'True' : 'False' }}</span>
                  <span v-if="props.student?.flag">🚩</span>
                </span>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    aria-label="Edit Flag"
                    @click="openEditField('flag')"
                  />
                  <UButton
                    v-if="props.student?.flag"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="error"
                    size="sm"
                    aria-label="Clear Flag"
                    @click="saveField('flag', 'false')"
                  />
                </div>
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

  <!-- Edit Field Modal -->
  <UModal
    v-model:open="showEditFieldModal"
    :title="`Edit ${editingFieldName ? (editingFieldName === 'b2b' ? 'B2B Partner' : editingFieldName.charAt(0).toUpperCase() + editingFieldName.slice(1)) : ''}`"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="saveField(editingFieldName!, editingFieldValue)"
      >
        <UFormField :label="editingFieldName ? (editingFieldName === 'b2b' ? 'B2B Partner' : editingFieldName.charAt(0).toUpperCase() + editingFieldName.slice(1)) : ''">
          <USelectMenu
            v-model="editingFieldValue"
            :items="editingFieldOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="Choose option"
          />
        </UFormField>

        <div class="flex gap-2 justify-end pt-1">
          <UButton
            variant="ghost"
            color="neutral"
            @click="showEditFieldModal = false"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            color="primary"
          >
            Save
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
