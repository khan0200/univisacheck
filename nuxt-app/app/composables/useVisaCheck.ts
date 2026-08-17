/**
 * app/composables/useVisaCheck.ts
 *
 * UniVisaCheck AutoCheck — Batched Concurrent Checking (Staggered Wave Dispatcher)
 *
 * - Process selected students in staggered batches of 3.
 * - 200ms delay between launching batches (WITHOUT awaiting in-flight requests).
 * - All requests run concurrently in the background and update each student row independently.
 * - Reactive state management with duplicate protection.
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
   * Single-student direct check.
   */
  async function checkOne(student: Student): Promise<void> {
    const passport = student.passport
    if (!passport) return

    // Duplicate-request protection
    if (studentsStore.checkingPassports.has(passport)) {
      return
    }

    studentsStore.sessionChanges = []
    studentsStore.isCheckingSession = true

    // Set individual student state to checking immediately
    studentsStore.checkingPassports.set(passport, 'processing')
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    try {
      const result = await apiFetch<DirectCheckResponse>('/api/jobs/direct', {
        method: 'POST',
        body: { passport }
      })

      // Update student row immediately in local reactive state without page refresh
      studentsStore.patchStudent(passport, {
        status: result.status,
        applicationDate: result.applicationDate,
        lastChecked: result.lastChecked,
        rejectReason: result.rejectReason,
        pdfUrl: result.pdfUrl,
        check_source: 'manual',
        checkSource: 'manual'
      }, result.lastChecked)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Visa Check Direct] Failed for ${passport}:`, msg)
    } finally {
      // Remove checking state
      studentsStore.checkingPassports.delete(passport)
      studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
    }
  }

  /**
   * Queue a batch on the server. The queue dispatches one task every 200ms
   * without waiting for earlier visa.go.kr responses, and survives navigation
   * or a browser disconnect.
   */
  async function checkMany(students: Student[]): Promise<JobCreationResponse> {
    const passports = [...new Set(
      students
        .map(student => student.passport?.toUpperCase().trim())
        .filter((passport): passport is string => Boolean(passport))
    )].filter(passport => !studentsStore.checkingPassports.has(passport))

    if (passports.length === 0) {
      return { jobId: '', status: 'empty', total: 0 }
    }

    studentsStore.sessionChanges = []
    studentsStore.isCheckingSession = true
    studentsStore.batchCheckProgress = {
      active: true,
      total: passports.length,
      completed: 0,
      failed: 0
    }

    let job: JobCreationResponse
    try {
      job = await createVisaCheckJob(passports)
    } catch (err) {
      studentsStore.isCheckingSession = false
      studentsStore.batchCheckProgress.active = false
      throw err
    }
    studentsStore.activeJob = {
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      createdAt: new Date().toISOString(),
      progress: { queued: job.total, processing: 0, completed: 0, failed: 0, cancelled: 0 }
    }

    for (const passport of passports) {
      studentsStore.checkingPassports.set(passport, 'queued')
    }
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    return job
  }

  // Legacy job management helpers if needed
  async function createVisaCheckJob(passports: string[]): Promise<JobCreationResponse> {
    const response = await apiFetch<JobCreationResponse>('/api/jobs', {
      method: 'POST',
      body: { passports }
    })
    return response
  }

  async function cancelJob(jobId: string): Promise<void> {
    await apiFetch<JobCancelResponse>('/api/jobs/cancel', {
      method: 'POST',
      body: { jobId }
    })
    studentsStore.activeJob = null
    studentsStore.checkingPassports = new Map()
  }

  return {
    checkOne,
    checkMany,
    createVisaCheckJob,
    cancelJob,
    checkingPassports,
    normalizeStatusForComparison
  }
}
