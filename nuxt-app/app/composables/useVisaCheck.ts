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
   * Batched Concurrent AutoCheck — Staggered Wave Dispatcher
   *
   * 1. Groups selected students into batches of 3.
   * 2. Launches each batch every 200ms WITHOUT waiting for earlier batches to complete.
   * 3. Each student independently transitions from 'checking' -> 'checked' / 'error'.
   * 4. Updates student row immediately upon individual completion without full page reload.
   */
  async function checkMany(students: Student[]): Promise<{ completed: number, failed: number }> {
    if (students.length === 0) return { completed: 0, failed: 0 }

    const BATCH_SIZE = 3
    const BATCH_DELAY = 200

    studentsStore.sessionChanges = []
    studentsStore.isCheckingSession = true

    studentsStore.batchCheckProgress = {
      active: true,
      total: students.length,
      completed: 0,
      failed: 0
    }

    let completedCount = 0
    let failedCount = 0

    // Individual request handler
    async function checkStudent(student: Student): Promise<void> {
      const passport = student.passport
      if (!passport) return

      // Duplicate-request protection
      if (studentsStore.checkingPassports.has(passport)) {
        return
      }

      // 1. Immediately mark this student as checking
      studentsStore.checkingPassports.set(passport, 'processing')
      studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

      let result: DirectCheckResponse | null = null
      let lastErr: unknown = null

      // Attempt direct check with fallback retry if needed
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await apiFetch<DirectCheckResponse>('/api/jobs/direct', {
            method: 'POST',
            body: { passport }
          })
          if (result) break
        } catch (err) {
          lastErr = err
          if (attempt === 1) {
            await new Promise(r => setTimeout(r, 300))
          }
        }
      }

      if (result) {
        // 2. Update student row immediately in local reactive state
        studentsStore.patchStudent(passport, {
          status: result.status,
          applicationDate: result.applicationDate,
          lastChecked: result.lastChecked,
          rejectReason: result.rejectReason,
          pdfUrl: result.pdfUrl,
          check_source: 'manual',
          checkSource: 'manual'
        }, result.lastChecked)
        completedCount++
      } else {
        failedCount++
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
        console.error(`[Visa Check Batch] Check failed for ${passport}:`, msg)
      }

      // 3. Update progress and clear checking state for this student
      studentsStore.batchCheckProgress.completed = completedCount + failedCount
      studentsStore.batchCheckProgress.failed = failedCount
      studentsStore.checkingPassports.delete(passport)
      studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
    }

    // Staggered wave dispatcher: Launch batches of 3 every 200ms
    // Do NOT await checkStudent() when launching the batch!
    const allInFlightPromises: Promise<void>[] = []

    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE)

      // Launch batch concurrently
      for (const student of batch) {
        allInFlightPromises.push(checkStudent(student))
      }

      // Wait 200ms before launching next batch (if more batches remain)
      if (i + BATCH_SIZE < students.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
      }
    }

    // Await all in-flight requests to eventually settle
    await Promise.allSettled(allInFlightPromises)

    // Keep progress bar visible briefly before sliding away
    setTimeout(() => {
      studentsStore.batchCheckProgress.active = false
    }, 1400)

    return { completed: completedCount, failed: failedCount }
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
