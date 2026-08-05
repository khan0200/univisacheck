import { defineStore } from 'pinia'
import type { Student, StatusFilter } from '~/types/student'
import { bucketForStatus } from '~/utils/visa-status'

export const useStudentsStore = defineStore('students', () => {
  const students = ref<Student[]>([])
  const isLoading = ref(false)
  const currentFilter = ref<StatusFilter>('pending')
  const searchQuery = ref('')
  const bulkDeleteMode = ref(false)

  const counts = computed(() => {
    const result: Record<StatusFilter, number> = { pending: 0, application: 0, cancelled: 0, approved: 0 }
    for (const student of matchingSearch.value) {
      result[bucketForStatus(student.status)]++
    }
    return result
  })

  const matchingSearch = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return students.value
    return students.value.filter((s) => {
      return (
        (s.fullName || '').toLowerCase().includes(query) ||
        (s.passport || '').toLowerCase().includes(query) ||
        (s.studentId || '').toLowerCase().includes(query) ||
        (s.visaType || '').toLowerCase().includes(query) ||
        (s.applicationNo || '').toLowerCase().includes(query)
      )
    })
  })

  const filteredStudents = computed(() => {
    const filtered = matchingSearch.value.filter((s) => bucketForStatus(s.status) === currentFilter.value)
    return [...filtered].sort((a, b) => {
      const dateA = a.applicationDate || '9999-99-99'
      const dateB = b.applicationDate || '9999-99-99'
      return dateA > dateB ? 1 : dateA < dateB ? -1 : 0
    })
  })

  const { list: listStudents } = useStudentsService()

  async function loadStudents() {
    isLoading.value = true
    try {
      students.value = await listStudents()
    } finally {
      isLoading.value = false
    }
  }

  function setFilter(filter: StatusFilter) {
    currentFilter.value = filter
    bulkDeleteMode.value = false
    for (const s of students.value) {
      if (bucketForStatus(s.status) !== 'application') s.batchSelected = false
    }
  }

  function upsertLocal(student: Student) {
    const index = students.value.findIndex((s) => s.passport === student.passport)
    if (index !== -1) students.value[index] = student
    else students.value.push(student)
  }

  function removeLocal(passports: string[]) {
    const set = new Set(passports)
    students.value = students.value.filter((s) => !set.has(s.passport))
  }

  return {
    students,
    isLoading,
    currentFilter,
    searchQuery,
    bulkDeleteMode,
    counts,
    filteredStudents,
    loadStudents,
    setFilter,
    upsertLocal,
    removeLocal
  }
})
