/**
 * server/api/cron/check-all-pending.post.ts
 *
 * 6-HOUR CRON ENDPOINT
 *
 * Rules:
 * 1. Auto-checks ALL students in the Pending tab and Application tab.
 * 2. Checks `lastChecked` timestamp column before enqueuing each student:
 *    - If `lastChecked` was LESS than 10 minutes ago -> IGNORE & SKIP student.
 *    - Only check students whose `lastChecked` is MORE than 10 minutes ago (or never checked).
 */

import { getTursoClient } from '../../utils/turso'

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

  // 2. Query ALL non-deleted students with non-final status (Pending, Application, Received, Under Review, etc.)
  const studentsRes = await db.execute({
    sql: `SELECT passport, userId, lastChecked, status FROM students
          WHERE deletedAt IS NULL
            AND (
              status IS NULL
              OR LOWER(status) NOT IN ('approved', 'visa used', 'cancelled', 'rejected', 'passport returned')
            )`,
    args: []
  })

  // 3. Filter out any student checked LESS than 10 minutes ago
  const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
    const lastChecked = String(row.lastChecked || '')
    const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

    // Cooldown rule: if checked less than 10 minutes ago, SKIP!
    if (minutesSinceChecked < 10) {
      return false
    }

    return true
  })

  if (eligibleRows.length === 0) {
    return {
      success: true,
      message: 'All Pending and Application students were checked within the last 10 minutes. Skipped.',
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
      console.error(`[6-Hour Cron] Failed to insert job for user ${userId}:`, err)
    }
  }

  // 6. Trigger Worker
  if (createdJobs.length > 0) {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const host = event.node.req.headers.host || 'localhost:3100'
    const workerUrl = `${protocol}://${host}/api/jobs/worker`

    console.log(`[6-Hour Cron] Enqueued ${eligibleRows.length} Pending/Application student(s) (checked >10 mins ago) across ${createdJobs.length} jobs. Triggering worker...`)

    const triggerPromise = $fetch(workerUrl, { method: 'POST' })
      .then(() => {
        console.log('[6-Hour Cron] Worker trigger completed.')
      })
      .catch((err: unknown) => {
        console.error('[6-Hour Cron] Worker trigger failed:', err)
      })

    event.waitUntil(triggerPromise)
  }

  return {
    success: true,
    message: `Enqueued ${eligibleRows.length} Pending/Application student(s) for 6-hour check.`,
    checkedCount: eligibleRows.length,
    jobsCreated: createdJobs.length
  }
})
