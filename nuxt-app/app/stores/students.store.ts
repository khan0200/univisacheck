import { defineStore } from 'pinia'
import type { Student, StatusFilter, VisaTypeFilter } from '~/types/student'
import { bucketForStatus, displayStatusText } from '~/utils/visa-status'

export const useStudentsStore = defineStore('students', () => {
  const students = ref<Student[]>([])
  const isLoading = ref(false)
  const currentFilter = ref<StatusFilter>('pending')
  const visaTypeFilter = ref<VisaTypeFilter>('all')
  const searchQuery = ref('')

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
      // If we are in the application tab, Under Review always comes first
      if (currentFilter.value === 'application') {
        const isUnderReviewA = displayStatusText(a.status) === 'Under Review'
        const isUnderReviewB = displayStatusText(b.status) === 'Under Review'
        if (isUnderReviewA && !isUnderReviewB) return -1
        if (!isUnderReviewA && isUnderReviewB) return 1
      }

      // Pinned students come next
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      
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

  /**
   * Surgically apply `changes` to the student identified by `passport`.
   * Used by useRealtimeSync to patch only the fields that changed, without
   * replacing the whole object or re-fetching the entire list.
   *
   * Returns true if the student was found and updated, false otherwise.
   * If the incoming `updatedAt` is older than a previously-applied event
   * for this student (race-condition), the patch is skipped.
   */
  function patchStudent(passport: string, changes: Partial<Student>, updatedAt?: string): boolean {
    const index = students.value.findIndex((s) => s.passport === passport)
    if (index === -1) return false

    // Race condition guard: skip if this event is older than what we already have
    if (updatedAt && students.value[index]!._realtimeUpdatedAt) {
      if (updatedAt < students.value[index]!._realtimeUpdatedAt!) return false
    }

    // Apply changes field-by-field so Vue tracks only the mutated keys
    const target = students.value[index]!
    for (const key of Object.keys(changes) as (keyof Student)[]) {
      (target as any)[key] = (changes as any)[key]
    }
    if (updatedAt) {
      (target as any)._realtimeUpdatedAt = updatedAt
    }
    return true
  }

  return {
    students,
    isLoading,
    currentFilter,
    visaTypeFilter,
    searchQuery,
    counts,
    visaTypeCounts,
    filteredStudents,
    loadStudents,
    setFilter,
    setVisaTypeFilter,
    upsertLocal,
    removeLocal,
    patchStudent
  }
})
