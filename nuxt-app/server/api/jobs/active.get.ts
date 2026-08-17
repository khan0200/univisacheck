/**
 * server/api/jobs/active.get.ts
 *
 * Retrieves the currently active job (queued or processing) for the authenticated user,
 * along with task counts (queued, processing, completed, failed, cancelled).
 */

import { getTursoClient } from '../../utils/turso'
import { verifyToken } from '../../utils/auth'
import { apiError } from '../../utils/api-error'

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
  const authUser = await verifyToken(event)
  if (!authUser) {
    apiError(401, 'Unauthorized')
  }
  const userId = authUser.userId

  const db = await getTursoClient()

  // 2. Fetch the oldest active manual job for the user (auto cron runs silently in background)
  const jobRes = await db.execute({
    sql: `SELECT id, total, status, createdAt FROM visa_check_jobs
          WHERE userId = ? AND status IN ('queued', 'processing') AND check_source = 'manual'
          ORDER BY createdAt ASC LIMIT 1`,
    args: [userId]
  })

  if (jobRes.rows.length === 0) {
    return null
  }

  const job = jobRes.rows[0] as unknown as Record<string, unknown>
  const jobId = String(job.id)

  // 3. Count status of tasks within this job
  const tasksRes = await db.execute({
    sql: `SELECT status, COUNT(*) as count FROM visa_check_tasks
          WHERE jobId = ?
          GROUP BY status`,
    args: [jobId]
  })

  const counts: Record<string, number> = {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  }

  for (const row of tasksRes.rows) {
    const status = String(row.status)
    counts[status] = Number(row.count)
  }

  // 4. Fetch list of tasks to synchronize state on load
  const detailTasksRes = await db.execute({
    sql: `SELECT passport, status FROM visa_check_tasks WHERE jobId = ?`,
    args: [jobId]
  })
  const tasksList = detailTasksRes.rows.map((row: Record<string, unknown>) => ({
    passport: String(row.passport),
    status: String(row.status)
  }))

  return {
    jobId,
    status: job.status,
    total: Number(job.total),
    createdAt: job.createdAt,
    progress: counts,
    tasks: tasksList
  }
})
