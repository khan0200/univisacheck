/**
 * server/api/cron/check-selected.post.ts
 *
 * 10-MINUTE CRON ENDPOINT
 *
 * Rules:
 * 1. Checks ONLY selected students (batchSelected = 1).
 * 2. Checks ONLY students whose application date is 10 or more days ago
 *    (embassy visa results are announced 10-15 days after application date).
 * 3. Skips students whose lastChecked timestamp was less than 10 minutes ago.
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

  // 2. Fetch all active selected students with pending / under review status
  const studentsRes = await db.execute({
    sql: `SELECT passport, userId, applicationDate, lastChecked, status FROM students
          WHERE deletedAt IS NULL
            AND batchSelected = 1
            AND (status IS NULL OR status = 'Application' OR status = 'Under Review' OR status = 'Topshirilgan' OR status = 'ko''rib chiqilmoqda' OR status = 'applied' OR status = 'Pending')`,
    args: []
  })

  // 3. Filter by Business Rules:
  // - Application date must be >= 10 days ago (visa result is near)
  // - lastChecked must be >= 10 minutes ago (ignore if checked < 10 mins ago)
  const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
    const appDate = String(row.applicationDate || '')
    const lastChecked = String(row.lastChecked || '')

    const daysSinceApplied = getDaysSinceApplication(appDate)
    const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

    // Must be >= 10 days after application date
    if (daysSinceApplied < 10) {
      return false
    }

    // Cooldown: skip if checked less than 10 minutes ago
    if (minutesSinceChecked < 10) {
      return false
    }

    return true
  })

  if (eligibleRows.length === 0) {
    return {
      success: true,
      message: 'No selected students meet the 10-day application threshold and 10-minute cooldown rule.',
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

    console.log(`[10-Min Cron] Enqueued ${eligibleRows.length} student(s) (>=10 days applied) across ${createdJobs.length} jobs. Triggering worker...`)

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
    message: `Enqueued ${eligibleRows.length} eligible selected student(s) (applied >=10 days ago).`,
    checkedCount: eligibleRows.length,
    jobsCreated: createdJobs.length
  }
})
