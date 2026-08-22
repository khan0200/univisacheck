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
  success?: boolean
  error?: string
}

export function useVisaCheck() {
  const { apiFetch } = useApiFetch()
  const studentsStore = useStudentsStore()
  const toast = useToast()
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
    studentsStore.sessionNoAnswers = []
    studentsStore.isCheckingSession = true

    // Set individual student state to checking immediately
    studentsStore.checkingPassports.set(passport, 'processing')
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    try {
      const result = await apiFetch<DirectCheckResponse>('/api/jobs/direct', {
        method: 'POST',
        body: { passport }
      })

      if (result.error || result.success === false) {
        studentsStore.sessionNoAnswers = [{
          fullName: student.fullName || student.passport,
          passport: student.passport,
          reason: result.error || 'Serverdan javob olinmadi'
        }]
      } else {
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
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Visa Check Direct] Failed for ${passport}:`, msg)
      studentsStore.sessionNoAnswers = [{
        fullName: student.fullName || student.passport,
        passport: student.passport,
        reason: msg
      }]
    } finally {
      // Remove checking state
      studentsStore.checkingPassports.delete(passport)
      studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
      studentsStore.isCheckingSession = false
    }
  }

  /**
   * Batched Concurrent AutoCheck — 10-Student Chunked Dispatcher with 1x Auto-Retry
   *
   * 1. Sends students in chunks of 10 concurrently.
   * 2. Waits for Chunk 1 to complete before sending Chunk 2.
   * 3. Collects any students that returned "No Answer" / Timeout / Network error.
   * 4. Automatically retries all failed students ONCE.
   * 5. Compiles session report (Status Changes + No Answer / Unreachable) and opens summary modal.
   */
  async function checkMany(students: Student[]): Promise<{ completed: number, failed: number }> {
    const list = students.filter(s => s.passport && !studentsStore.checkingPassports.has(s.passport))
    if (list.length === 0) return { completed: 0, failed: 0 }

    studentsStore.sessionChanges = []
    studentsStore.sessionNoAnswers = []
    studentsStore.sessionSummary = {
      total: list.length,
      changed: 0,
      unchanged: 0,
      noAnswer: 0
    }
    studentsStore.isCheckingSession = true
    studentsStore.batchCheckProgress = {
      active: true,
      total: list.length,
      completed: 0,
      failed: 0
    }

    // Mark all as processing in reactive state
    for (const student of list) {
      studentsStore.checkingPassports.set(student.passport, 'processing')
    }
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    async function checkStudentDirect(student: Student): Promise<{ success: boolean, error?: string }> {
      const passport = student.passport
      if (!passport) return { success: false, error: 'Missing passport' }

      try {
        const result = await apiFetch<DirectCheckResponse>('/api/jobs/direct', {
          method: 'POST',
          body: { passport }
        })

        if (result.error || result.success === false) {
          return { success: false, error: result.error || 'Serverdan javob olinmadi (Timeout)' }
        }

        studentsStore.patchStudent(passport, {
          status: result.status,
          applicationDate: result.applicationDate,
          lastChecked: result.lastChecked,
          rejectReason: result.rejectReason,
          pdfUrl: result.pdfUrl,
          check_source: 'manual',
          checkSource: 'manual'
        }, result.lastChecked)

        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Visa Check Batch] Error for ${passport}:`, msg)
        return { success: false, error: msg }
      }
    }

    const CHUNK_SIZE = 10
    const STAGGER_DELAY = 150 // 150ms delay between student dispatches
    const firstPassFailed: { student: Student, reason?: string }[] = []
    let completedCount = 0

    // --- PASS 1: Chunked batches of 10 students with 150ms stagger ---
    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      const chunk = list.slice(i, i + CHUNK_SIZE)
      const inFlightPromises: Promise<void>[] = []

      for (let j = 0; j < chunk.length; j++) {
        const student = chunk[j]!
        inFlightPromises.push(
          (async () => {
            const res = await checkStudentDirect(student)
            if (res.success) {
              completedCount++
            } else {
              firstPassFailed.push({ student, reason: res.error })
            }
            studentsStore.batchCheckProgress.completed = completedCount
            studentsStore.batchCheckProgress.failed = firstPassFailed.length
          })()
        )

        // Stagger dispatch by 150ms between each student in the chunk
        if (j < chunk.length - 1) {
          await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY))
        }
      }

      // Wait for all in-flight checks in this chunk of 10 to resolve before starting next chunk
      await Promise.allSettled(inFlightPromises)
    }

    // --- PASS 2: 1x Automatic Retry for Failed / No-Answer Students ---
    const stillFailed: { student: Student, reason?: string }[] = []
    if (firstPassFailed.length > 0) {
      // Brief grace pause before retry
      await new Promise(resolve => setTimeout(resolve, 500))

      for (let i = 0; i < firstPassFailed.length; i += CHUNK_SIZE) {
        const retryChunk = firstPassFailed.slice(i, i + CHUNK_SIZE)
        const retryInFlightPromises: Promise<void>[] = []

        for (let j = 0; j < retryChunk.length; j++) {
          const { student } = retryChunk[j]!
          retryInFlightPromises.push(
            (async () => {
              const res = await checkStudentDirect(student)
              if (res.success) {
                completedCount++
                studentsStore.batchCheckProgress.completed = completedCount
                studentsStore.batchCheckProgress.failed = Math.max(0, studentsStore.batchCheckProgress.failed - 1)
              } else {
                stillFailed.push({ student, reason: res.error })
              }
            })()
          )

          // Stagger retry dispatches by 150ms
          if (j < retryChunk.length - 1) {
            await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY))
          }
        }

        await Promise.allSettled(retryInFlightPromises)
      }
    }

    // Clean up checking indicators
    for (const student of list) {
      studentsStore.checkingPassports.delete(student.passport)
    }
    studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

    // Store final unresolved no-answers
    studentsStore.sessionNoAnswers = stillFailed.map(f => ({
      fullName: f.student.fullName || f.student.passport,
      passport: f.student.passport,
      reason: f.reason || 'Serverdan javob olinmadi'
    }))

    const changedCount = studentsStore.sessionChanges.length
    const noAnswerCount = stillFailed.length
    const unchangedCount = Math.max(0, completedCount - changedCount)

    studentsStore.sessionSummary = {
      total: list.length,
      changed: changedCount,
      unchanged: unchangedCount,
      noAnswer: noAnswerCount
    }

    setTimeout(() => {
      studentsStore.batchCheckProgress.active = false
      studentsStore.isCheckingSession = false

      // The report modal only earns a full-screen interruption when there is
      // something to act on — a status change, or a student the portal never
      // answered for (which offers a retry). A clean run where every student
      // came back unchanged is the common case; it gets a toast instead.
      const hasSomethingToReport = changedCount > 0 || noAnswerCount > 0

      if (hasSomethingToReport) {
        studentsStore.showReportModal = true
      } else {
        toast.add({
          title: 'O\'zgarishlar kuzatilmadi',
          description: `${list.length} ta talaba tekshirildi`,
          icon: 'i-lucide-check',
          color: 'success'
        })
      }
    }, 600)

    return { completed: completedCount, failed: noAnswerCount }
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
