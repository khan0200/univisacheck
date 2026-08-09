/**
 * server/plugins/local-cron-scheduler.ts
 *
 * Local development cron scheduler for Nitro server.
 * Ensures 10-minute auto-checks run automatically on localhost:3100
 * without relying on external cloud triggers during local development.
 */

import { getTursoClient } from '../utils/turso'

/** Calculate calendar days elapsed since applicationDate (YYYY-MM-DD). */
function getDaysSinceApplication(appDateStr: string): number {
  if (!appDateStr) return 10 // Default to 10 if missing
  const match = appDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match || !match[1] || !match[2] || !match[3]) return 10
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)

  const appDate = new Date(year, month, day)
  const today = new Date()
  appDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const diffMs = today.getTime() - appDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/** Calculate minutes elapsed since lastChecked timestamp. */
function getMinutesSinceLastChecked(lastCheckedStr: string): number {
  if (!lastCheckedStr) return Infinity
  const checkedDate = new Date(lastCheckedStr)
  if (isNaN(checkedDate.getTime())) return Infinity
  const diffMs = Date.now() - checkedDate.getTime()
  return Math.floor(diffMs / (1000 * 60))
}

async function runLocal10MinAutoCheck() {
  try {
    const db = await getTursoClient()

    // Query non-deleted selected students in non-final statuses
    const studentsRes = await db.execute({
      sql: `SELECT passport, userId, applicationDate, lastChecked, status FROM students
            WHERE deletedAt IS NULL
              AND batchSelected = 1
              AND (
                status IS NULL
                OR LOWER(status) NOT IN ('approved', 'visa used', 'cancelled', 'rejected', 'passport returned')
              )`,
      args: []
    })

    const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
      const appDate = String(row.applicationDate || '')
      const lastChecked = String(row.lastChecked || '')

      const daysSinceApplied = getDaysSinceApplication(appDate)
      const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

      // Allow selected students if applied >= 1 day ago (or missing date) AND cooldown >= 10 mins
      if (appDate && daysSinceApplied < 1) {
        return false
      }

      if (minutesSinceChecked < 10) {
        return false
      }

      return true
    })

    if (eligibleRows.length === 0) {
      console.log('[Local Scheduler] 10-Min Auto-Check: No eligible selected students to check.')
      return
    }

    const userMap = new Map<number, string[]>()
    for (const row of eligibleRows) {
      const uId = Number(row.userId)
      const pass = String(row.passport).toUpperCase().trim()
      if (!uId || !pass) continue
      if (!userMap.has(uId)) userMap.set(uId, [])
      userMap.get(uId)!.push(pass)
    }

    const createdJobs: string[] = []
    const now = new Date().toISOString()

    for (const [userId, passports] of userMap.entries()) {
      const jobId = crypto.randomUUID()
      const statements: { sql: string, args: (string | number | null)[] }[] = []

      statements.push({
        sql: `INSERT INTO visa_check_jobs (id, userId, total, status, createdAt, updatedAt)
              VALUES (?, ?, ?, 'queued', ?, ?)`,
        args: [jobId, userId, passports.length, now, now]
      })

      for (const passport of passports) {
        const taskId = crypto.randomUUID()
        statements.push({
          sql: `INSERT INTO visa_check_tasks (id, jobId, userId, passport, status, attempts, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)`,
          args: [taskId, jobId, userId, passport, now, now]
        })
      }

      await db.batch(statements, 'write')
      createdJobs.push(jobId)
    }

    console.log(`[Local Scheduler] 10-Min Auto-Check: Created ${createdJobs.length} job(s) for ${eligibleRows.length} student(s). Triggering worker...`)

    // Trigger local worker
    const workerUrl = 'http://localhost:3100/api/jobs/worker'
    $fetch(workerUrl, { method: 'POST' })
      .then(() => console.log('[Local Scheduler] Worker completed check batch.'))
      .catch((err: unknown) => console.error('[Local Scheduler] Worker trigger failed:', err instanceof Error ? err.message : String(err)))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Local Scheduler] Error running local 10-min check:', msg)
  }
}

export default defineNitroPlugin(() => {
  // Only run local interval scheduler in local development mode or non-Vercel environment
  if (process.env.VERCEL) {
    return // Vercel uses cloud cron triggers from cron-job.org
  }

  console.log('[Local Scheduler] Initializing local 10-minute auto-check interval for localhost...')

  // Calculate ms remaining to next 10-minute boundary
  const now = new Date()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  const msInCycle = ((minutes % 10) * 60 + seconds) * 1000 + now.getMilliseconds()
  const initialDelay = 600000 - msInCycle

  setTimeout(() => {
    runLocal10MinAutoCheck()
    setInterval(runLocal10MinAutoCheck, 10 * 60 * 1000)
  }, Math.max(1000, initialDelay))
})
