import { defineStore } from 'pinia'
import type { Student, StatusFilter, VisaTypeFilter } from '~/types/student'
import { bucketForStatus } from '~/utils/visa-status'

export const useStudentsStore = defineStore('students', () => {
  const students = ref<Student[]>([])
  const isLoading = ref(false)
  const currentFilter = ref<StatusFilter>('pending')
  const visaTypeFilter = ref<VisaTypeFilter>('all')
  const searchQuery = ref('')
  const bulkDeleteMode = ref(false)

  const counts = computed(() => {
    const result: Record<StatusFilter, number> = { pending: 0, application: 0, cancelled: 0, approved: 0 }
    for (const student of matchingSearch.value) {
      result[bucketForStatus(student.status)]++
    }
    return result
  })

  const visaTypeCounts = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    const result: Record<VisaTypeFilter, number> = { all: 0, Embassy: 0, 'E-Visa': 0, Regional: 0 }
    for (const s of students.value) {
      if (query) {
        const matchesQuery =
          (s.fullName || '').toLowerCase().includes(query) ||
          (s.passport || '').toLowerCase().includes(query) ||
          (s.studentId || '').toLowerCase().includes(query) ||
          (s.visaType || '').toLowerCase().includes(query) ||
          (s.applicationNo || '').toLowerCase().includes(query)
        if (!matchesQuery) continue
      }
      result.all++
      const type = s.visaType || 'Embassy'
      if (type === 'E-Visa') result['E-Visa']++
      else if (type === 'Regional') result.Regional++
      else result.Embassy++
    }
    return result
  })

  const matchingSearch = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    return students.value.filter((s) => {
      const type = s.visaType || 'Embassy'
      if (visaTypeFilter.value !== 'all' && type !== visaTypeFilter.value) return false
      if (!query) return true
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

  function setVisaTypeFilter(filter: VisaTypeFilter) {
    visaTypeFilter.value = filter
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
    visaTypeFilter,
    searchQuery,
    bulkDeleteMode,
    counts,
    visaTypeCounts,
    filteredStudents,
    loadStudents,
    setFilter,
    setVisaTypeFilter,
    upsertLocal,
    removeLocal
  }
})
