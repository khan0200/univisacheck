<script setup lang="ts">
import type { Student } from '~/types/student'

const props = defineProps<{
  students: Student[]
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  delete: [passports: string[]]
}>()

const searchQuery = ref('')
const selectedPassports = ref<Set<string>>(new Set())

const filteredStudents = computed(() => {
  if (!searchQuery.value) return props.students
  const query = searchQuery.value.toLowerCase()
  return props.students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(query) ||
      s.passport.toLowerCase().includes(query) ||
      (s.applicationNo && s.applicationNo.toLowerCase().includes(query)) ||
      (s.studentId && s.studentId.toLowerCase().includes(query))
  )
})

const isAllSelected = computed(() => {
  return filteredStudents.value.length > 0 && 
         filteredStudents.value.every((s) => selectedPassports.value.has(s.passport))
})

function toggleAll() {
  if (isAllSelected.value) {
    filteredStudents.value.forEach((s) => selectedPassports.value.delete(s.passport))
  } else {
    filteredStudents.value.forEach((s) => selectedPassports.value.add(s.passport))
  }
}

function toggleStudent(passport: string, checked: boolean) {
  if (checked) {
    selectedPassports.value.add(passport)
  } else {
    selectedPassports.value.delete(passport)
  }
}

function handleDelete() {
  const toDelete = Array.from(selectedPassports.value)
  if (toDelete.length > 0) {
    emit('delete', toDelete)
  }
}

function close() {
  emit('update:open', false)
}

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      searchQuery.value = ''
      selectedPassports.value.clear()
    }
  }
)
</script>

<template>
  <UModal
    :open="props.open"
    title="Select to Delete"
    :ui="{ content: 'sm:max-w-xl', body: 'p-0 sm:p-0' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="px-4 py-3 sm:px-6 border-b border-gray-200 dark:border-white/10">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search by name, passport..."
          size="sm"
          class="w-full"
        />
      </div>

      <div v-if="filteredStudents.length === 0" class="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No students found.
      </div>
      <div v-else class="divide-y divide-gray-200 dark:divide-white/10 max-h-[60vh] overflow-y-auto">
        <div class="px-4 py-2 bg-gray-50 dark:bg-white/5 flex items-center justify-between sticky top-0 z-10">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              class="size-4 rounded border-neutral-300 text-primary-700 focus:ring-primary-600 cursor-pointer"
              :checked="isAllSelected"
              @change="toggleAll"
            />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-200">Select All</span>
          </label>
          <span class="text-xs text-gray-500">{{ selectedPassports.size }} selected</span>
        </div>
        <div
          v-for="student in filteredStudents"
          :key="student.passport"
          class="px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer"
          @click="toggleStudent(student.passport, !selectedPassports.has(student.passport))"
        >
          <div class="flex items-center gap-3 min-w-0">
            <input
              type="checkbox"
              class="size-4 rounded border-neutral-300 text-primary-700 focus:ring-primary-600 cursor-pointer"
              :checked="selectedPassports.has(student.passport)"
              @change="toggleStudent(student.passport, ($event.target as HTMLInputElement).checked)"
              @click.stop
            />
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {{ student.fullName }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                {{ student.passport }}
              </p>
            </div>
          </div>
          <StudentStatusBadge :status="student.status" />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton color="neutral" variant="ghost" @click="close">
          Cancel
        </UButton>
        <UButton
          color="error"
          :disabled="selectedPassports.size === 0"
          @click="handleDelete"
        >
          Delete ({{ selectedPassports.size }})
        </UButton>
      </div>
    </template>
  </UModal>
</template>
