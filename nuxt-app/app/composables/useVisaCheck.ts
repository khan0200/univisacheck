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
   * Batched Concurrent AutoCheck — High-Performance Staggered Direct Wave Dispatcher
   *
   * - Launches students directly via /api/jobs/direct in staggered waves of 4.
   * - 150ms stagger between launching waves without waiting for in-flight requests.
   * - Each student row updates immediately in local reactive state as soon as their check resolves (~500ms).
   * - Live Activity / Dynamic Island progress bar tracks completed/failed counts in real time.
   * - No server queue insertion, no database locking, no `queued` delay.
   */
  async function checkMany(students: Student[]): Promise<{ completed: number, failed: number }> {
    const list = students.filter(s => s.passport && !studentsStore.checkingPassports.has(s.passport))
    if (list.length === 0) return { completed: 0, failed: 0 }

    studentsStore.sessionChanges = []
    studentsStore.isCheckingSession = true
    studentsStore.batchCheckProgress = {
      active: true,
      total: list.length,
      completed: 0,
      failed: 0
    }

    let completedCount = 0
    let failedCount = 0

    // Mark all as processing immediately (NO 'queued' status!)
    for (const student of list) {
      studentsStore.checkingPassports.set(student.passport, 'processing')
    }
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    async function checkStudent(student: Student): Promise<void> {
      const passport = student.passport
      if (!passport) return

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
        studentsStore.batchCheckProgress.completed = completedCount + failedCount
        studentsStore.batchCheckProgress.failed = failedCount
        studentsStore.checkingPassports.delete(passport)
        studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
      }
    }

    const BATCH_SIZE = 4
    const BATCH_DELAY = 150
    const allInFlightPromises: Promise<void>[] = []

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE)
      for (const s of batch) {
        allInFlightPromises.push(checkStudent(s))
      }
      if (i + BATCH_SIZE < list.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
      }
    }

    await Promise.allSettled(allInFlightPromises)

    setTimeout(() => {
      studentsStore.batchCheckProgress.active = false
      studentsStore.isCheckingSession = false
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
