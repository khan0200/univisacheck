<script setup lang="ts">
import type { Student, StudentFormInput, VisaType } from '~/types/student'
import { formatDateInput, formatPassportInput, validateBirthday, validatePassport } from '~/utils/validation'

const props = defineProps<{
  open: boolean
  editingStudent: Student | null
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const toast = useToast()
const studentsStore = useStudentsStore()
const { save } = useStudentsService()
const { status: lookupStatus, onPassportInput, reset: resetLookup } = usePassportLookup()

const isEdit = computed(() => Boolean(props.editingStudent))
const originalPassport = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const form = reactive<StudentFormInput>({
  fullName: '',
  passport: '',
  birthday: '',
  studentId: '',
  visaType: 'Embassy',
  applicationNo: '',
  tariff: '',
  university: '',
  coordinator: ''
})

const tariffsList = ref<{ name: string }[]>([])
const universitiesList = ref<{ name: string }[]>([])
const coordinatorsList = ref<{ name: string }[]>([])
const { apiFetch } = useApiFetch()

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
    console.error('Failed to load dropdown options in form modal:', err)
  }
}

const tariffOptions = computed(() => {
  const list = tariffsList.value.map(t => ({ value: t.name, label: t.name }))
  return [{ value: '', label: 'None' }, ...list]
})

const universityOptions = computed(() => {
  const list = universitiesList.value.map(u => ({ value: u.name, label: u.name }))
  return [{ value: '', label: 'None' }, ...list]
})

const coordinatorOptions = computed(() => {
  const list = coordinatorsList.value.map(c => ({ value: c.name, label: c.name }))
  return [{ value: '', label: 'None' }, ...list]
})

function resetForm() {
  form.fullName = ''
  form.passport = ''
  form.birthday = ''
  form.studentId = ''
  form.visaType = 'Embassy'
  form.applicationNo = ''
  form.tariff = ''
  form.university = ''
  form.coordinator = ''
  originalPassport.value = ''
  errorMessage.value = ''
  resetLookup()
}

watch(() => props.open, (open) => {
  if (!open) {
    resetForm()
    return
  }
  loadOptions()
  if (props.editingStudent) {
    const s = props.editingStudent
    form.fullName = s.fullName
    form.passport = s.passport
    form.birthday = s.birthday
    form.studentId = s.studentId || ''
    form.visaType = s.visaType || 'Embassy'
    form.applicationNo = s.applicationNo || ''
    form.tariff = s.tariff || ''
    form.university = s.university || ''
    form.coordinator = s.coordinator || ''
    originalPassport.value = s.passport
  } else {
    resetForm()
  }
})

function setVisaType(value: VisaType) {
  form.visaType = value
  if (value !== 'E-Visa' && value !== 'Regional') form.applicationNo = ''
}

function handlePassportInput(e: Event) {
  const input = e.target as HTMLInputElement
  form.passport = formatPassportInput(input.value)
  onPassportInput(form.passport, isEdit.value, (fullName, birthday) => {
    if (fullName && !form.fullName.trim()) form.fullName = fullName
    if (birthday && !form.birthday.trim()) form.birthday = birthday
  })
}

function handleBirthdayInput(e: Event) {
  form.birthday = formatDateInput((e.target as HTMLInputElement).value)
}

function handleUppercase(field: 'fullName' | 'studentId' | 'applicationNo', e: Event) {
  form[field] = (e.target as HTMLInputElement).value.toUpperCase()
}

async function handleSubmit() {
  errorMessage.value = ''
  const fullName = form.fullName.toUpperCase().trim()
  const passport = form.passport.toUpperCase().trim()
  const birthday = form.birthday.trim()

  const passportError = validatePassport(passport)
  if (passportError) {
    errorMessage.value = passportError
    return
  }

  const birthdayError = validateBirthday(birthday)
  if (birthdayError) {
    errorMessage.value = birthdayError
    return
  }

  const duplicate = studentsStore.students.find(s => s.passport === passport && s.passport !== originalPassport.value)
  if (duplicate) {
    errorMessage.value = `Student with passport ${passport} already exists`
    return
  }

  submitting.value = true
  try {
    const payload: StudentFormInput & { status?: string; lastChecked: string } = {
      fullName,
      passport,
      birthday,
      studentId: form.studentId.trim(),
      visaType: form.visaType,
      applicationNo: form.applicationNo.trim().toUpperCase(),
      lastChecked: new Date().toISOString(),
      tariff: form.tariff,
      university: form.university,
      coordinator: form.coordinator
    }
    if (isEdit.value && originalPassport.value && originalPassport.value !== passport) {
      payload.originalPassport = originalPassport.value
    }
    if (!isEdit.value) {
      payload.status = 'Pending'
    }

    await save(payload)

    // Immediately reflect the change in the originating browser's local store.
    // Other browsers will receive the change via the SSE realtime channel.
    // For edits, patch the existing student; for new students, add to top of list.
    if (isEdit.value) {
      const existing = studentsStore.students.find(
        s => s.passport === (originalPassport.value || passport)
      )
      if (existing) {
        studentsStore.upsertLocal({
          ...existing,
          passport,
          fullName,
          birthday,
          studentId: form.studentId.trim(),
          visaType: form.visaType,
          applicationNo: form.applicationNo.trim().toUpperCase(),
          tariff: form.tariff,
          university: form.university,
          coordinator: form.coordinator
        })
      }
    } else {
      studentsStore.upsertLocal({
        passport,
        fullName,
        birthday,
        studentId: form.studentId.trim(),
        visaType: form.visaType,
        applicationNo: form.applicationNo.trim().toUpperCase(),
        status: 'Pending',
        lastChecked: payload.lastChecked,
        tariff: form.tariff,
        university: form.university,
        coordinator: form.coordinator
      })
    }

    toast.add({ title: isEdit.value ? 'Student updated' : 'Student added', color: 'primary', duration: 2500 })
    emit('saved')
    emit('update:open', false)
  } catch (e: unknown) {
    errorMessage.value = apiErrorMessage(e, 'Failed to save student. Please try again.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="isEdit ? 'Edit Student' : 'Add New Student'"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <form
        class="space-y-5"
        @submit.prevent="handleSubmit"
      >
        <div>
          <label class="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
            Visa Type
          </label>
          <div class="grid grid-cols-3 gap-1 p-1 rounded-md bg-white ring-1 ring-black/[0.06]">
            <button
              type="button"
              class="rounded-sm py-2.5 text-sm font-extrabold transition-colors"
              :class="form.visaType === 'Embassy' ? 'bg-primary text-white shadow-sm' : 'text-primary-900'"
              @click="setVisaType('Embassy')"
            >
              Embassy
            </button>
            <button
              type="button"
              class="rounded-sm py-2.5 text-sm font-extrabold transition-colors"
              :class="form.visaType === 'E-Visa' ? 'bg-primary text-white shadow-sm' : 'text-primary-900'"
              @click="setVisaType('E-Visa')"
            >
              E-Visa
            </button>
            <button
              type="button"
              class="rounded-sm py-2.5 text-sm font-extrabold transition-colors"
              :class="form.visaType === 'Regional' ? 'bg-primary text-white shadow-sm' : 'text-primary-900'"
              @click="setVisaType('Regional')"
            >
              Regional
            </button>
          </div>
        </div>

        <UFormField label="Passport Number">
          <UInput
            :model-value="form.passport"
            placeholder="AA1234567"
            required
            class="w-full"
            @input="handlePassportInput"
          />
          <p
            v-if="lookupStatus === 'checking'"
            class="text-xs text-[var(--color-text-secondary)] mt-1 flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              class="size-3 animate-spin"
            />
            Checking…
          </p>
          <p
            v-else-if="lookupStatus === 'duplicate'"
            class="text-xs text-warning-600 mt-1 flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-triangle-alert"
              class="size-3"
            />
            This student is already in your database.
          </p>
          <p
            v-else-if="lookupStatus === 'found'"
            class="text-xs text-primary-700 dark:text-secondary-300 mt-1 flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-info"
              class="size-3"
            />
            Found in our records — name & birthday autofilled.
          </p>
        </UFormField>

        <UFormField label="Full Name">
          <UInput
            :model-value="form.fullName"
            placeholder="ABDUVOHIDOV KUVONCHBEK ABDUMUMIN UGLI"
            required
            class="w-full"
            @input="handleUppercase('fullName', $event)"
          />
        </UFormField>

        <UFormField
          label="Birthday"
          hint="Format: YYYY-MM-DD"
        >
          <UInput
            :model-value="form.birthday"
            placeholder="YYYY-MM-DD"
            maxlength="10"
            required
            class="w-full"
            @input="handleBirthdayInput"
          />
        </UFormField>

        <UFormField
          v-if="form.visaType === 'E-Visa' || form.visaType === 'Regional'"
          label="Application Number"
        >
          <UInput
            :model-value="form.applicationNo"
            placeholder="AP2026123456"
            class="w-full"
            @input="handleUppercase('applicationNo', $event)"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <UFormField label="Tariff">
            <USelect
              v-model="form.tariff"
              :items="tariffOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              placeholder="Choose Tariff"
            />
          </UFormField>
          <UFormField label="University">
            <USelect
              v-model="form.university"
              :items="universityOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              placeholder="Choose University"
            />
          </UFormField>
          <UFormField label="Coordinator">
            <USelect
              v-model="form.coordinator"
              :items="coordinatorOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              placeholder="Choose Coordinator"
            />
          </UFormField>
        </div>

        <UFormField label="Student ID">
          <UInput
            :model-value="form.studentId"
            placeholder="M445"
            class="w-full"
            @input="handleUppercase('studentId', $event)"
          />
        </UFormField>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          :title="errorMessage"
        />

        <UiLoadingButton
          type="submit"
          block
          size="lg"
          :loading="submitting"
          color="primary"
        >
          {{ isEdit ? 'Update Student' : 'Save Student' }}
        </UiLoadingButton>
      </form>
    </template>
  </UModal>
</template>
