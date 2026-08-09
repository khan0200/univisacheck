/**
 * server/api/cron/check-selected.post.ts
 *
 * Endpoint for automated cron triggers (e.g. from cron-job.org or Vercel Crons).
 * Secures requests with CRON_SECRET header and enqueues selected pending students into the visa check queue.
 */

import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  // 1. Verify Secret Key for Security
  const authHeader = getRequestHeader(event, 'authorization') || ''
  const cronSecret = process.env.CRON_SECRET || ''

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized: Invalid CRON_SECRET' })
  }

  const db = await getTursoClient()

  // 2. Fetch all non-deleted students marked for checking with pending/under-review status
  const studentsRes = await db.execute({
    sql: `SELECT passport, userId FROM students
          WHERE deletedAt IS NULL
            AND batchSelected = 1
            AND (status IS NULL OR status = 'Application' OR status = 'Under Review' OR status = 'Topshirilgan' OR status = 'ko''rib chiqilmoqda' OR status = 'applied')`,
    args: []
  })

  if (studentsRes.rows.length === 0) {
    return { success: true, message: 'No selected students require checking.', checked: 0 }
  }

  // 3. Group passports by userId
  const userMap = new Map<number, string[]>()
  for (const row of studentsRes.rows) {
    const uId = Number(row.userId)
    const pass = String(row.passport).toUpperCase().trim()
    if (!uId || !pass) continue
    if (!userMap.has(uId)) userMap.set(uId, [])
    userMap.get(uId)!.push(pass)
  }

  const createdJobs: string[] = []
  const now = new Date().toISOString()

  // 4. Create Job Queue per user
  for (const [userId, passports] of userMap.entries()) {
    const jobId = crypto.randomUUID()
    const statements: { sql: string; args: (string | number | null)[] }[] = []

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
      console.error(`[Cron API] Failed to insert job for user ${userId}:`, err)
    }
  }

  // 5. Trigger Queue Worker asynchronously
  if (createdJobs.length > 0) {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const host = event.node.req.headers.host || 'localhost:3100'
    const workerUrl = `${protocol}://${host}/api/jobs/worker`

    console.log(`[Cron API] Enqueued ${studentsRes.rows.length} students across ${createdJobs.length} jobs. Triggering worker at ${workerUrl}`)

    const triggerPromise = $fetch(workerUrl, { method: 'POST' })
      .then(() => console.log('[Cron API] Worker trigger completed.'))
      .catch((err) => console.error('[Cron API] Worker trigger failed:', err))

    event.waitUntil(triggerPromise)
  }

  return {
    success: true,
    message: `Enqueued ${studentsRes.rows.length} student(s) for automatic checking.`,
    checkedCount: studentsRes.rows.length,
    jobsCreated: createdJobs.length
  }
})
