/**
 * server/plugins/local-cron-scheduler.ts
 *
 * Local development cron scheduler for Nitro server.
 * Ensures both 10-minute and 6-hour auto-checks run automatically on localhost:3100
 * without relying on external cloud triggers during local development.
 */

import { getTursoClient } from '../utils/turso'

/** Calculate minutes elapsed since lastChecked timestamp. */
function getMinutesSinceLastChecked(lastCheckedStr: string): number {
  if (!lastCheckedStr) return Infinity
  const checkedDate = new Date(lastCheckedStr)
  if (isNaN(checkedDate.getTime())) return Infinity
  const diffMs = Date.now() - checkedDate.getTime()
  return Math.floor(diffMs / (1000 * 60))
}

/** 10-Minute Auto Check: Priority for selected in-progress students */
async function runLocal10MinAutoCheck() {
  try {
    const db = await getTursoClient()

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
      const lastChecked = String(row.lastChecked || '')
      const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

      if (minutesSinceChecked < 3) {
        return false
      }

      return true
    })

    if (eligibleRows.length === 0) {
      console.log('[Local Scheduler] 10-Min Auto-Check: No selected students to check.')
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

    console.log(`[Local Scheduler] 10-Min Auto-Check: Created ${createdJobs.length} job(s) for ${eligibleRows.length} selected student(s). Triggering worker...`)

    const workerUrl = 'http://localhost:3100/api/jobs/worker'
    $fetch(workerUrl, { method: 'POST' })
      .then(() => console.log('[Local Scheduler] Worker completed 10-min batch.'))
      .catch((err: unknown) => console.error('[Local Scheduler] Worker trigger failed:', err instanceof Error ? err.message : String(err)))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Local Scheduler] Error running local 10-min check:', msg)
  }
}

/** 6-Hour Auto Check: All Pending and Application tab students (>10 mins lastChecked) */
async function runLocal6HourAutoCheck() {
  try {
    const db = await getTursoClient()

    const studentsRes = await db.execute({
      sql: `SELECT passport, userId, lastChecked, status FROM students
            WHERE deletedAt IS NULL
              AND (
                status IS NULL
                OR LOWER(status) NOT IN ('approved', 'visa used', 'cancelled', 'rejected', 'passport returned')
              )`,
      args: []
    })

    const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
      const lastChecked = String(row.lastChecked || '')
      const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

      // Cooldown rule: skip if checked less than 10 minutes ago
      if (minutesSinceChecked < 10) {
        return false
      }

      return true
    })

    if (eligibleRows.length === 0) {
      console.log('[Local Scheduler] 6-Hour Auto-Check: All students were checked within the last 10 minutes. Skipped.')
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

    console.log(`[Local Scheduler] 6-Hour Auto-Check: Created ${createdJobs.length} job(s) for ${eligibleRows.length} student(s). Triggering worker...`)

    const workerUrl = 'http://localhost:3100/api/jobs/worker'
    $fetch(workerUrl, { method: 'POST' })
      .then(() => console.log('[Local Scheduler] Worker completed 6-hour batch.'))
      .catch((err: unknown) => console.error('[Local Scheduler] Worker trigger failed:', err instanceof Error ? err.message : String(err)))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Local Scheduler] Error running local 6-hour check:', msg)
  }
}

export default defineNitroPlugin(() => {
  if (process.env.VERCEL) {
    return // Vercel uses cloud cron triggers from cron-job.org
  }

  console.log('[Local Scheduler] Initializing local 10-minute and 6-hour auto-check schedulers for localhost...')

  // Calculate ms remaining to next 10-minute boundary
  const now = new Date()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  const msInCycle = ((minutes % 10) * 60 + seconds) * 1000 + now.getMilliseconds()
  const initialDelay10m = 600000 - msInCycle

  // Start 10-minute interval
  setTimeout(() => {
    runLocal10MinAutoCheck()
    setInterval(runLocal10MinAutoCheck, 10 * 60 * 1000)
  }, Math.max(1000, initialDelay10m))

  // Start 6-hour interval (every 6 hours)
  setInterval(runLocal6HourAutoCheck, 6 * 60 * 60 * 1000)
})
