/**
 * server/api/jobs/cancel.post.ts
 *
 * Cancels an active job for the authenticated user.
 * Marks the job as cancelled and cancels all queued tasks.
 */

import { getTursoClient } from '../../utils/turso'
import { verifyToken } from '../../utils/auth'
import { apiError } from '../../utils/api-error'
import { publishRealtime } from '../../utils/realtime-publisher'

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
  const authUser = await verifyToken(event)
  if (!authUser) {
    apiError(401, 'Unauthorized')
  }
  const userId = authUser.userId

  // 2. Parse body
  const body = await readBody(event)
  const jobId = body.jobId

  if (!jobId) {
    apiError(400, 'Missing jobId')
  }

  const db = await getTursoClient()

  // 3. Verify job ownership and status
  const jobRes = await db.execute({
    sql: 'SELECT id, status, total FROM visa_check_jobs WHERE id = ? AND userId = ?',
    args: [jobId, userId]
  })

  if (jobRes.rows.length === 0) {
    apiError(404, 'Job not found.')
  }

  const job = jobRes.rows[0] as any
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return { success: true, message: 'Job already finished.' }
  }

  // 4. Cancel job and its queued tasks inside a transaction
  const tx = await db.transaction('write')
  try {
    // Update Job Status
    await tx.execute({
      sql: "UPDATE visa_check_jobs SET status = 'cancelled', updatedAt = datetime('now') WHERE id = ?",
      args: [jobId]
    })

    // Update Queued Tasks to Cancelled
    await tx.execute({
      sql: "UPDATE visa_check_tasks SET status = 'cancelled', updatedAt = datetime('now') WHERE jobId = ? AND status = 'queued'",
      args: [jobId]
    })

    await tx.commit()
  } catch (err: any) {
    await tx.rollback()
    console.error('[Jobs Cancel API] Error:', err.message)
    apiError(500, 'Failed to cancel job.')
  }

  // 5. Send realtime notification of progress update (now showing cancelled)
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

  await publishRealtime(userId, {
    type: 'visa_check.progress',
    jobId,
    total: Number(job.total),
    status: 'cancelled',
    progress: counts
  })

  return { success: true, message: 'Job cancelled successfully.' }
})
