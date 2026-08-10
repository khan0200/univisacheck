import { defineStore } from 'pinia'
import type { Student, StatusFilter, VisaTypeFilter } from '~/types/student'
import { bucketForStatus, displayStatusText } from '~/utils/visa-status'

export const useStudentsStore = defineStore('students', () => {
  const students = ref<Student[]>([])
  const isLoading = ref(false)
  const currentFilter = ref<StatusFilter>('pending')
  const visaTypeFilter = ref<VisaTypeFilter>('all')
  const searchQuery = ref('')

  interface JobProgress {
    jobId: string
    status: string
    total: number
    createdAt: string
    progress: {
      queued: number
      processing: number
      completed: number
      failed: number
      cancelled: number
    }
  }

  const activeJob = ref<JobProgress | null>(null)
  const checkingPassports = ref<Map<string, 'queued' | 'processing'>>(new Map())

  // Helper to precompute search index
  function addSearchNormalized(s: Student) {
    s._searchNormalized = `${s.fullName || ''} ${s.passport || ''} ${s.studentId || ''} ${s.visaType || ''} ${s.applicationNo || ''}`.toLowerCase()
  }

  const counts = computed(() => {
    const result: Record<StatusFilter, number> = { pending: 0, application: 0, cancelled: 0, approved: 0 }
    const list = matchingSearch.value
    for (const student of list) {
      result[bucketForStatus(student.status)]++
    }
    return result
  })

  const visaTypeCounts = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    const result: Record<VisaTypeFilter, number> = { 'all': 0, 'Embassy': 0, 'E-Visa': 0, 'Regional': 0 }
    const list = students.value
    for (const s of list) {
      if (query) {
        if (!s._searchNormalized) {
          addSearchNormalized(s)
        }
        if (!s._searchNormalized!.includes(query)) continue
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
    const filterType = visaTypeFilter.value
    const hasTypeFilter = filterType !== 'all'
    const list = students.value

    return list.filter((s) => {
      const type = s.visaType || 'Embassy'
      if (hasTypeFilter && type !== filterType) return false
      if (!query) return true
      if (!s._searchNormalized) {
        addSearchNormalized(s)
      }
      return s._searchNormalized!.includes(query)
    })
  })

  const filteredStudents = computed(() => {
    const filterVal = currentFilter.value
    const filtered = matchingSearch.value.filter(s => bucketForStatus(s.status) === filterVal)

    return [...filtered].sort((a, b) => {
      if (filterVal === 'application') {
        const isUnderReviewA = displayStatusText(a.status) === 'Under Review'
        const isUnderReviewB = displayStatusText(b.status) === 'Under Review'
        if (isUnderReviewA && !isUnderReviewB) return -1
        if (!isUnderReviewA && isUnderReviewB) return 1
      }

      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1

      const dateA = a.applicationDate || '9999-99-99'
      const dateB = b.applicationDate || '9999-99-99'
      return dateA > dateB ? 1 : dateA < dateB ? -1 : 0
    })
  })

  /** True when at least one student in the current filtered list has a university set. */
  const hasAnyUniversity = computed(() =>
    filteredStudents.value.some(s => !!s.university)
  )

  /**
   * Students grouped by university, sorted alphabetically.
   * Students without a university are placed in a group with key ''.
   * Only populated when hasAnyUniversity is true.
   */
  const groupedByUniversity = computed((): { university: string; students: Student[] }[] => {
    const map = new Map<string, Student[]>()
    for (const student of filteredStudents.value) {
      const key = student.university?.trim() || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(student)
    }
    // Sort groups: named universities alphabetically, then '' (no university) last
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === '') return 1
        if (b === '') return -1
        return a.localeCompare(b)
      })
      .map(([university, students]) => ({ university, students }))
  })

  const { list: listStudents } = useStudentsService()
  let activeLoadPromise: Promise<Student[]> | null = null

  async function loadActiveJob() {
    try {
      const { apiFetch } = useApiFetch()
      const job = await apiFetch<(JobProgress & { tasks?: { passport: string, status: string }[] }) | null>('/api/jobs/active')
      activeJob.value = job
      if (job && job.tasks) {
        checkingPassports.value = new Map(
          job.tasks
            .filter(t => t.status === 'queued' || t.status === 'processing')
            .map(t => [t.passport, t.status as 'queued' | 'processing'])
        )
      } else {
        checkingPassports.value = new Map()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Students Store] Failed to load active job:', msg)
    }
  }

  async function loadStudents() {
    if (activeLoadPromise) {
      await activeLoadPromise
      return
    }
    isLoading.value = true
    try {
      activeLoadPromise = listStudents()
      const list = await activeLoadPromise
      for (const s of list) {
        addSearchNormalized(s)
      }
      students.value = list
      await loadActiveJob()
    } finally {
      isLoading.value = false
      activeLoadPromise = null
    }
  }

  function setFilter(filter: StatusFilter) {
    currentFilter.value = filter
    for (const s of students.value) {
      if (s.batchSelected && bucketForStatus(s.status) !== 'application') {
        s.batchSelected = false
      }
    }
  }

  function setVisaTypeFilter(filter: VisaTypeFilter) {
    visaTypeFilter.value = filter
  }

  function upsertLocal(student: Student) {
    addSearchNormalized(student)
    const normalizedPassport = student.passport.toUpperCase().trim()
    const index = students.value.findIndex(s => s.passport.toUpperCase().trim() === normalizedPassport)
    if (index !== -1) students.value[index] = student
    else students.value.push(student)
  }

  function removeLocal(passports: string[]) {
    const set = new Set(passports.map(p => p.toUpperCase().trim()))
    students.value = students.value.filter(s => !set.has(s.passport.toUpperCase().trim()))
  }

  function patchStudent(passport: string, changes: Partial<Student>, updatedAt?: string): boolean {
    const normalizedPassport = passport.toUpperCase().trim()
    const index = students.value.findIndex(s => s.passport.toUpperCase().trim() === normalizedPassport)
    if (index === -1) return false

    if (updatedAt && students.value[index]!._realtimeUpdatedAt) {
      if (updatedAt < students.value[index]!._realtimeUpdatedAt!) return false
    }

    const target = students.value[index]!
    for (const key of Object.keys(changes) as (keyof Student)[]) {
      const val = changes[key]
      if (val !== undefined) {
        (target as Record<string, unknown>)[key as string] = val
      }
    }
    if (updatedAt) {
      target._realtimeUpdatedAt = updatedAt
    }
    addSearchNormalized(target)
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
    hasAnyUniversity,
    groupedByUniversity,
    loadStudents,
    setFilter,
    setVisaTypeFilter,
    upsertLocal,
    removeLocal,
    patchStudent,
    activeJob,
    loadActiveJob,
    checkingPassports
  }
})
