/**
 * server/plugins/local-cron-scheduler.ts
 *
 * Local development cron scheduler for Nitro server.
 * Ensures both 10-minute and 6-hour auto-checks run automatically on localhost:3100
 * without relying on external cloud triggers during local development.
 */

import { getTursoClient } from '../utils/turso'

/** Calculate calendar days elapsed since applicationDate (YYYY-MM-DD). */
function getDaysSinceApplication(appDateStr: string): number {
  if (!appDateStr) return 0
  const match = appDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match || !match[1] || !match[2] || !match[3]) return 0
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

/** 10-Minute Auto Check: Priority for selected students in Application tab */
async function runLocal10MinAutoCheck() {
  try {
    // Apply Korean Standard Time (KST) night-mode check:
    // - 09:00 to 21:00 KST: Run every 10 minutes (always)
    // - 21:00 to 08:59 KST: Run every 3 hours (at 21:00, 00:00, 03:00, 06:00 KST)
    const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    const kstHour = kstDate.getHours()
    const kstMinute = kstDate.getMinutes()

    const isDaytime = kstHour >= 9 && kstHour < 21

    if (!isDaytime) {
      const isNightCheckHour = kstHour === 21 || kstHour === 0 || kstHour === 3 || kstHour === 6
      const isTriggerSlot = isNightCheckHour && kstMinute < 10

      if (!isTriggerSlot) {
        console.log(`[Local Scheduler] Skipping 10-min check during KST night mode (current KST: ${String(kstHour).padStart(2, '0')}:${String(kstMinute).padStart(2, '0')}).`)
        return
      }
    }

    const db = await getTursoClient()

    const studentsRes = await db.execute({
      sql: `SELECT passport, userId, applicationDate, lastChecked, status FROM students
            WHERE deletedAt IS NULL
              AND batchSelected = 1
              AND status IS NOT NULL
              AND LOWER(status) NOT IN ('pending', 'approved', 'visa used', 'cancelled', 'rejected', 'passport returned')`,
      args: []
    })

    const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
      const appDate = String(row.applicationDate || '')
      const statusRaw = String(row.status || '').toLowerCase()

      const daysSinceApplied = getDaysSinceApplication(appDate)

      const isUnderReview = statusRaw.includes('under review')
      const isSupplement = statusRaw.includes('supplement') || statusRaw.includes('asking')
      const isLocalStatus = statusRaw.includes('topshirilgan') || statusRaw.includes('ko\'rib chiqilmoqda')
      const isUnderReviewOrSupplement = isUnderReview || isSupplement || isLocalStatus

      const isApplied10DaysOrMore = Boolean(appDate) && daysSinceApplied >= 10

      return isUnderReviewOrSupplement || isApplied10DaysOrMore
    })

    if (eligibleRows.length === 0) {
      console.log('[Local Scheduler] 10-Min Auto-Check: No selected Application tab students match rules.')
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
        sql: `INSERT INTO visa_check_jobs (id, userId, total, status, check_source, createdAt, updatedAt)
              VALUES (?, ?, ?, 'queued', 'auto', ?, ?)`,
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

      if (minutesSinceChecked < 10) {
        return false
      }

      return true
    })

    if (eligibleRows.length === 0) {
      console.log('[Local Scheduler] 6-Hour Auto-Check: All students checked within last 10 mins. Skipped.')
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
        sql: `INSERT INTO visa_check_jobs (id, userId, total, status, check_source, createdAt, updatedAt)
              VALUES (?, ?, ?, 'queued', 'auto', ?, ?)`,
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

  const now = new Date()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  const msInCycle = ((minutes % 10) * 60 + seconds) * 1000 + now.getMilliseconds()
  const initialDelay10m = 600000 - msInCycle

  setTimeout(() => {
    runLocal10MinAutoCheck()
    setInterval(runLocal10MinAutoCheck, 10 * 60 * 1000)
  }, Math.max(1000, initialDelay10m))

  setInterval(runLocal6HourAutoCheck, 6 * 60 * 60 * 1000)
})
