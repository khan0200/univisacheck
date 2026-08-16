/**
 * app/composables/useVisaCheck.ts
 *
 * checkOne — fast direct path (no queue): calls /api/jobs/direct for instant results.
 * checkMany — bulk queue path: creates a queued job for multiple students.
 */

import type { Student } from '~/types/student'
import { normalizeStatusForComparison } from '~/utils/visa-status'

interface JobCreationResponse {
  jobId: string
  status: string
  total: number
}

interface JobCancelResponse {
  success: boolean
}

interface DirectCheckResponse {
  passport: string
  status: string
  applicationDate: string
  lastChecked: string
  rejectReason: string
  pdfUrl: string
  statusChanged: boolean
  oldStatus: string
}

export function useVisaCheck() {
  const { apiFetch } = useApiFetch()
  const studentsStore = useStudentsStore()
  const checkingPassports = computed(() => studentsStore.checkingPassports)

  /**
   * Single-student fast check — bypasses the queue.
   * Calls /api/jobs/direct which runs synchronously and returns the result immediately.
   * The SSE realtime event is still published server-side so other tabs also refresh.
   */
  async function checkOne(student: Student): Promise<void> {
    const passport = student.passport

    studentsStore.sessionChanges = []
    studentsStore.isCheckingSession = true

    // Optimistically mark as "processing" right away — no "queued" intermediate state
    studentsStore.checkingPassports.set(passport, 'processing')
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    try {
      const result = await apiFetch<DirectCheckResponse>('/api/jobs/direct', {
        method: 'POST',
        body: { passport }
      })

      // Patch the student in the store immediately from the response
      studentsStore.patchStudent(passport, {
        status: result.status,
        applicationDate: result.applicationDate,
        lastChecked: result.lastChecked,
        rejectReason: result.rejectReason,
        pdfUrl: result.pdfUrl
      }, result.lastChecked)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Visa Check Direct] Failed:', msg)
    } finally {
      // Remove from checking state
      studentsStore.checkingPassports.delete(passport)
      studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
    }
  }

  // Creates a job for the specified passports and updates studentsStore.activeJob
  async function createVisaCheckJob(passports: string[]): Promise<JobCreationResponse> {
    studentsStore.sessionChanges = []
    studentsStore.isCheckingSession = true

    // 1. Optimistically add passports to checkingPassports BEFORE the fetch
    // to prevent race conditions where realtime events arrive before the fetch resolves.
    for (const passport of passports) {
      if (!studentsStore.checkingPassports.has(passport)) {
        studentsStore.checkingPassports.set(passport, 'queued')
      }
    }
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    try {
      const response = await apiFetch<JobCreationResponse>('/api/jobs', {
        method: 'POST',
        body: { passports }
      })

      // 2. Only update activeJob if we haven't already received a progress event for this job.
      const stillChecking = passports.some(p => studentsStore.checkingPassports.has(p))
      const alreadyTracking = studentsStore.activeJob?.jobId === response.jobId

      if (!alreadyTracking && stillChecking) {
        studentsStore.activeJob = {
          jobId: response.jobId,
          status: response.status,
          total: response.total,
          createdAt: new Date().toISOString(),
          progress: {
            queued: response.total,
            processing: 0,
            completed: 0,
            failed: 0,
            cancelled: 0
          }
        }
      }

      return response
    } catch (err) {
      // Revert optimistic updates
      for (const passport of passports) {
        if (studentsStore.checkingPassports.get(passport) === 'queued') {
          studentsStore.checkingPassports.delete(passport)
        }
      }
      studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Visa Check Queue] Failed to create job:', msg)
      throw err
    }
  }

  // Cancel job
  async function cancelJob(jobId: string): Promise<void> {
    try {
      await apiFetch<JobCancelResponse>('/api/jobs/cancel', {
        method: 'POST',
        body: { jobId }
      })
      studentsStore.activeJob = null
      studentsStore.checkingPassports = new Map()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Visa Check Queue] Failed to cancel job:', msg)
      throw err
    }
  }

  /**
   * Batch fast-path — fires /api/jobs/direct for every student,
   * staggered 300 ms apart, while keeping active UI state until
   * all concurrent checks complete.
   */
  async function checkMany(students: Student[]): Promise<{ completed: number, failed: number }> {
    if (students.length === 0) return { completed: 0, failed: 0 }

    studentsStore.sessionChanges = []
    studentsStore.isCheckingSession = true

    // Immediately mark every student as "processing" for instant UI feedback
    for (const student of students) {
      studentsStore.checkingPassports.set(student.passport, 'processing')
    }
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    let completedCount = 0
    let failedCount = 0

    // Fire direct checks with 300 ms stagger and await all results
    const checkPromises = students.map((student, i) => {
      const passport = student.passport
      return new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            const result = await apiFetch<DirectCheckResponse>('/api/jobs/direct', {
              method: 'POST',
              body: { passport }
            })
            studentsStore.patchStudent(passport, {
              status: result.status,
              applicationDate: result.applicationDate,
              lastChecked: result.lastChecked,
              rejectReason: result.rejectReason,
              pdfUrl: result.pdfUrl
            }, result.lastChecked)
            completedCount++
          } catch (err) {
            failedCount++
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`[Visa Check Batch] Direct check failed for ${passport}:`, msg)
          } finally {
            studentsStore.checkingPassports.delete(passport)
            studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
            resolve()
          }
        }, i * 300)
      })
    })

    await Promise.all(checkPromises)

    return { completed: completedCount, failed: failedCount }
  }

  return { checkOne, checkMany, createVisaCheckJob, cancelJob, checkingPassports, normalizeStatusForComparison }
}
