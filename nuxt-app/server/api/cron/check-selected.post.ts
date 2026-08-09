/**
 * server/api/cron/check-selected.post.ts
 *
 * 10-MINUTE CRON ENDPOINT
 *
 * Priority Rule:
 * - Selected students (batchSelected = 1) with Under Review or in-progress status
 *   are FIRST PRIORITY.
 * - Auto-checks every selected non-final student on every 10-minute cycle regardless of application date.
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

  // 2. Fetch all active selected students with non-final status (Under Review, Received, Pending supplement, etc.)
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

  // 3. Priority Filter:
  // - Every selected student in Under Review / in-progress status is checked every 10 minutes.
  // - Skip only if checked within the last 3 minutes (safety to prevent immediate double-fire).
  const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
    const lastChecked = String(row.lastChecked || '')
    const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

    if (minutesSinceChecked < 3) {
      return false
    }

    return true
  })

  if (eligibleRows.length === 0) {
    return {
      success: true,
      message: 'No selected students require checking at this moment.',
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

    console.log(`[10-Min Cron] Enqueued ${eligibleRows.length} priority selected student(s) across ${createdJobs.length} jobs. Triggering worker...`)

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
    message: `Enqueued ${eligibleRows.length} priority selected student(s) for 10-minute auto check.`,
    checkedCount: eligibleRows.length,
    jobsCreated: createdJobs.length
  }
})
