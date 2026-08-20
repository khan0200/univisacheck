import { defineStore } from 'pinia'
import type { Student, StatusFilter, VisaTypeFilter } from '~/types/student'
import { bucketForStatus, displayStatusText, isUnderReviewStatus, isSupplementStatus, isSupplementSubmittedStatus, normalizeStatusForComparison, getStatusDate } from '~/utils/visa-status'

export const useStudentsStore = defineStore('students', () => {
  const students = ref<Student[]>([])
  const isLoading = ref(false)
  const currentFilter = ref<StatusFilter>('pending')
  const visaTypeFilter = ref<VisaTypeFilter>('all')
  const searchQuery = ref('')
  const sortBy = ref<'university' | 'tariff' | 'applicationDate' | 'statusDate' | 'underReview' | 'selected'>('university')

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

  const batchCheckProgress = ref<{
    active: boolean
    total: number
    completed: number
    failed: number
  }>({
    active: false,
    total: 0,
    completed: 0,
    failed: 0
  })

  const sessionChanges = ref<{ fullName: string, passport?: string, oldStatus: string, newStatus: string }[]>([])
  const sessionNoAnswers = ref<{ fullName: string, passport: string, reason?: string }[]>([])
  const sessionSummary = ref<{ total: number, changed: number, unchanged: number, noAnswer: number }>({
    total: 0,
    changed: 0,
    unchanged: 0,
    noAnswer: 0
  })
  const showReportModal = ref(false)
  const isCheckingSession = ref(false)

  // Helper to precompute search index
  function addSearchNormalized(s: Student) {
    s._searchNormalized = `${s.fullName || ''} ${s.passport || ''} ${s.studentId || ''} ${s.visaType || ''} ${s.applicationNo || ''} ${s.university || ''}`.toLowerCase()
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
    let filtered = matchingSearch.value.filter(s => bucketForStatus(s.status) === filterVal)

    if (sortBy.value === 'underReview') {
      filtered = filtered.filter(s => isUnderReviewStatus(s.status) || isSupplementStatus(s.status))
    }

    return [...filtered].sort((a, b) => {
      if (sortBy.value === 'selected') {
        const aSel = a.batchSelected ? 1 : 0
        const bSel = b.batchSelected ? 1 : 0
        if (aSel !== bSel) return bSel - aSel
      }

      if (filterVal === 'application') {
        const isUnderReviewA = displayStatusText(a.status) === 'Under Review' || isUnderReviewStatus(a.status)
        const isUnderReviewB = displayStatusText(b.status) === 'Under Review' || isUnderReviewStatus(b.status)
        if (isUnderReviewA && !isUnderReviewB) return -1
        if (!isUnderReviewA && isUnderReviewB) return 1
      }

      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1

      if (sortBy.value === 'statusDate') {
        const dateA = getStatusDate(a) || '9999-99-99'
        const dateB = getStatusDate(b) || '9999-99-99'
        if (dateA !== dateB) return dateA > dateB ? 1 : -1
      }

      const dateA = a.applicationDate || '9999-99-99'
      const dateB = b.applicationDate || '9999-99-99'
      return dateA > dateB ? 1 : dateA < dateB ? -1 : 0
    })
  })

  /** True when at least one student in the current filtered list has the chosen sort field set. */
  const hasAnyGroup = computed(() => {
    const sort = sortBy.value
    if (sort === 'university') return filteredStudents.value.some(s => !!s.university)
    if (sort === 'tariff') return filteredStudents.value.some(s => !!s.tariff)
    if (sort === 'applicationDate') return filteredStudents.value.some(s => !!s.applicationDate)
    if (sort === 'statusDate') return filteredStudents.value.some(s => !!getStatusDate(s))
    if (sort === 'underReview') return filteredStudents.value.some(s => isUnderReviewStatus(s.status) || isSupplementStatus(s.status))
    return false
  })

  /**
   * Students grouped by the selected sort option.
   * Students without the field are placed in a group with key ''.
   * Only populated when hasAnyGroup is true.
   */
  const groupedStudents = computed((): { groupName: string, students: Student[] }[] => {
    const map = new Map<string, Student[]>()
    const sort = sortBy.value
    for (const student of filteredStudents.value) {
      let key = ''
      if (sort === 'university') key = student.university?.trim() || ''
      else if (sort === 'tariff') key = student.tariff?.trim() || ''
      else if (sort === 'applicationDate') key = student.applicationDate?.trim() || ''
      else if (sort === 'statusDate') key = getStatusDate(student)?.trim() || ''
      else if (sort === 'underReview') {
        if (isSupplementSubmittedStatus(student.status)) {
          key = 'Supplement Submitted'
        } else if (isSupplementStatus(student.status)) {
          key = 'Supplement Needed'
        } else if (isUnderReviewStatus(student.status)) {
          key = 'Under Review'
        }
      }

      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(student)
    }
    // Sort groups
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (sort === 'underReview') {
          if (a === 'Supplement Needed') return -1
          if (b === 'Supplement Needed') return 1
          if (a === 'Supplement Submitted') return -1
          if (b === 'Supplement Submitted') return 1
          if (a === 'Under Review') return -1
          if (b === 'Under Review') return 1
        }
        if (a === '') return 1
        if (b === '') return -1
        return a.localeCompare(b)
      })
      .map(([groupName, students]) => ({ groupName, students }))
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

  async function loadStudents(options?: { silent?: boolean }) {
    if (activeLoadPromise) {
      await activeLoadPromise
      return
    }
    if (!options?.silent && students.value.length === 0) {
      isLoading.value = true
    }
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
      if (s.batchSelected && bucketForStatus(s.status) !== 'application' && bucketForStatus(s.status) !== 'pending') {
        s.batchSelected = false
      }
    }
  }

  function setVisaTypeFilter(filter: VisaTypeFilter) {
    visaTypeFilter.value = filter
  }

  function setSortBy(field: 'university' | 'tariff' | 'applicationDate' | 'statusDate' | 'underReview' | 'selected') {
    sortBy.value = field
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
    const oldStatus = target.status
    const newStatus = changes.status

    if (newStatus && normalizeStatusForComparison(oldStatus) !== normalizeStatusForComparison(newStatus)) {
      if (isCheckingSession.value) {
        // Prevent duplicate entries for the same student
        const exists = sessionChanges.value.some(c => c.passport === target.passport || c.fullName === target.fullName)
        if (!exists) {
          sessionChanges.value.push({
            fullName: target.fullName,
            passport: target.passport,
            oldStatus,
            newStatus
          })
        }
      }
    }

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

  watch(() => checkingPassports.value.size, (newSize, oldSize) => {
    if (isCheckingSession.value && oldSize > 0 && newSize === 0) {
      isCheckingSession.value = false
    }
  })

  return {
    students,
    isLoading,
    currentFilter,
    visaTypeFilter,
    searchQuery,
    counts,
    visaTypeCounts,
    filteredStudents,
    sortBy,
    hasAnyGroup,
    groupedStudents,
    loadStudents,
    setFilter,
    setVisaTypeFilter,
    setSortBy,
    upsertLocal,
    removeLocal,
    patchStudent,
    activeJob,
    loadActiveJob,
    checkingPassports,
    batchCheckProgress,
    sessionChanges,
    sessionNoAnswers,
    sessionSummary,
    showReportModal,
    isCheckingSession
  }
})
