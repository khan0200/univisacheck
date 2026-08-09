/**
 * server/api/cron/check-selected.post.ts
 *
 * 10-MINUTE CRON ENDPOINT
 *
 * Eligibility Rules for Selected Students in Application Tab (batchSelected = 1):
 * - Checks ONLY selected students in the Application tab (status != 'Pending').
 * - Excludes final statuses ('approved', 'cancelled', 'rejected', etc.) and 'pending'.
 * - Auto-checks if:
 *   Condition A: status is "Under Review" or "Pending Supplement" (regardless of app date).
 *   OR
 *   Condition B: applicationDate is 10 or more days ago.
 */

import { getTursoClient } from '../../utils/turso'

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

export default defineEventHandler(async (event) => {
  // 1. Verify Secret Key
  const authHeader = getRequestHeader(event, 'authorization') || ''
  const cronSecret = process.env.CRON_SECRET || ''

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized: Invalid CRON_SECRET' })
  }

  const db = await getTursoClient()

  // 2. Fetch all active selected students in Application tab (excluding 'pending' and final statuses)
  const studentsRes = await db.execute({
    sql: `SELECT passport, userId, applicationDate, lastChecked, status FROM students
          WHERE deletedAt IS NULL
            AND batchSelected = 1
            AND status IS NOT NULL
            AND LOWER(status) NOT IN ('pending', 'approved', 'visa used', 'cancelled', 'rejected', 'passport returned')`,
    args: []
  })

  // 3. Filter by Eligibility Rules:
  // - Condition A: status is Under Review / Pending Supplement (regardless of app date)
  // OR
  // - Condition B: applicationDate >= 10 days ago
  const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
    const appDate = String(row.applicationDate || '')
    const lastChecked = String(row.lastChecked || '')
    const statusRaw = String(row.status || '').toLowerCase()

    const daysSinceApplied = getDaysSinceApplication(appDate)
    const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

    // Cooldown safeguard: skip if checked within last 3 minutes
    if (minutesSinceChecked < 3) {
      return false
    }

    const isUnderReviewOrSupplement
        = statusRaw.includes('under review')
        || statusRaw.includes('supplement')
        || statusRaw.includes('topshirilgan')
        || statusRaw.includes('ko\'rib chiqilmoqda')
        || statusRaw.includes('asking')

    const isApplied10DaysOrMore = Boolean(appDate) && daysSinceApplied >= 10

    // Must satisfy EITHER Condition A OR Condition B
    return isUnderReviewOrSupplement || isApplied10DaysOrMore
  })

  if (eligibleRows.length === 0) {
    return {
      success: true,
      message: 'No selected Application tab students currently match the 10-minute check rules.',
      checkedCount: 0
    }
  }

  // 4. Group passports by userId
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

  // 5. Create Job Queue per user
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

    try {
      await db.batch(statements, 'write')
      createdJobs.push(jobId)
    } catch (err) {
      console.error(`[10-Min Cron] Failed to insert job for user ${userId}:`, err)
    }
  }

  // 6. Trigger Worker
  if (createdJobs.length > 0) {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const host = event.node.req.headers.host || 'localhost:3100'
    const workerUrl = `${protocol}://${host}/api/jobs/worker`

    console.log(`[10-Min Cron] Enqueued ${eligibleRows.length} eligible selected student(s) across ${createdJobs.length} jobs. Triggering worker...`)

    const triggerPromise = $fetch(workerUrl, { method: 'POST' })
      .then(() => {
        console.log('[10-Min Cron] Worker trigger completed.')
      })
      .catch((err: unknown) => {
        console.error('[10-Min Cron] Worker trigger failed:', err)
      })

    event.waitUntil(triggerPromise)
  }

  return {
    success: true,
    message: `Enqueued ${eligibleRows.length} eligible selected student(s) for 10-minute auto check.`,
    checkedCount: eligibleRows.length,
    jobsCreated: createdJobs.length
  }
})
