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
   * Batched Concurrent AutoCheck — High-Performance Concurrency Worker Pool
   *
   * - Runs 4 concurrent workers.
   * - Keep-Alive connection reuse ensures ~500ms checks per student.
   * - Table rows and the Live Activity / Dynamic Island pill update in real-time.
   */
  async function checkMany(students: Student[]): Promise<{ completed: number, failed: number }> {
    if (students.length === 0) return { completed: 0, failed: 0 }

    const CONCURRENCY = 4

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

      try {
        const result = await apiFetch<DirectCheckResponse>('/api/jobs/direct', {
          method: 'POST',
          body: { passport }
        })

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
      } catch (err) {
        failedCount++
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Visa Check Batch] Check failed for ${passport}:`, msg)
      } finally {
        // 3. Update progress and clear checking state for this student
        studentsStore.batchCheckProgress.completed = completedCount + failedCount
        studentsStore.batchCheckProgress.failed = failedCount
        studentsStore.checkingPassports.delete(passport)
        studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
      }
    }

    // Controlled Concurrency Worker Pool
    let currentIndex = 0

    async function worker(): Promise<void> {
      while (currentIndex < students.length) {
        const studentIndex = currentIndex++
        const student = students[studentIndex]
        if (student) {
          await checkStudent(student)
        }
      }
    }

    const workerCount = Math.min(CONCURRENCY, students.length)
    const workerPromises: Promise<void>[] = []
    for (let i = 0; i < workerCount; i++) {
      workerPromises.push(worker())
    }

    // Await all workers to finish processing the queue
    await Promise.all(workerPromises)

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
