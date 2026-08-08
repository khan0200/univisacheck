/**
 * app/composables/useVisaCheck.ts
 *
 * Rewritten to use the persistent backend job queue.
 * Initiates visa checks by creating jobs and tracking active job progress.
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

export function useVisaCheck() {
  const { apiFetch } = useApiFetch()
  const studentsStore = useStudentsStore()
  const checkingPassports = computed(() => studentsStore.checkingPassports)

  // Creates a job for the specified passports and updates studentsStore.activeJob
  async function createVisaCheckJob(passports: string[]): Promise<JobCreationResponse> {
    try {
      const response = await apiFetch<JobCreationResponse>('/api/jobs', {
        method: 'POST',
        body: { passports }
      })

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

      // Add all passports of the new job to the checkingPassports loading set
      for (const passport of passports) {
        studentsStore.checkingPassports.set(passport, 'queued')
      }
      studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

      return response
    } catch (err) {
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

  // Keep checkOne and checkMany interfaces but redirect them to use the queue
  async function checkOne(student: Student): Promise<void> {
    await createVisaCheckJob([student.passport])
  }

  async function checkMany(students: Student[]): Promise<void> {
    const passports = students.map(s => s.passport)
    await createVisaCheckJob(passports)
  }

  return { checkOne, checkMany, createVisaCheckJob, cancelJob, checkingPassports, normalizeStatusForComparison }
}
