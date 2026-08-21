/**
 * server/api/jobs/index.post.ts
 *
 * Creates a visa check job for a batch of students.
 * Inserts the job and its tasks into the database and triggers the worker.
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

  // 2. Parse body
  const body = await readBody(event)
  const passports = Array.isArray(body.passports)
    ? body.passports.map((p: string) => p.toUpperCase().trim()).filter(Boolean)
    : []

  if (passports.length === 0) {
    apiError(400, 'No student passports provided for checking.')
  }

  const db = await getTursoClient()

  // 3. Verify user owns all requested student passports (security)
  const placeholders = passports.map(() => '?').join(', ')
  const ownedRes = await db.execute({
    sql: `SELECT passport FROM students WHERE userId = ? AND deletedAt IS NULL AND passport IN (${placeholders})`,
    args: [userId, ...passports]
  })
  const ownedPassports = ownedRes.rows.map((r: Record<string, unknown>) => String(r.passport))

  if (ownedPassports.length === 0) {
    apiError(403, 'Forbidden: You do not own any of the requested student records.')
  }

  // 4. Generate Job and Task IDs
  const jobId = crypto.randomUUID()
  const now = new Date().toISOString()

  // 5. Insert Job and Tasks inside a batch transaction
  try {
    const statements: { sql: string, args: (string | number | null)[] }[] = []

    // A user can start a newer batch before an older one has finished. Keep
    // only the newest request meaningful: cancel older queued/processing tasks so they
    // cannot build an ever-growing backlog or overwrite fresh checks later.
    statements.push({
      sql: `UPDATE visa_check_tasks
            SET status = 'cancelled', lockedAt = NULL, lockedBy = NULL, updatedAt = datetime('now')
            WHERE userId = ? AND status IN ('queued', 'processing')`,
      args: [userId]
    })
    statements.push({
      sql: `UPDATE visa_check_jobs
            SET status = 'cancelled', updatedAt = datetime('now')
            WHERE userId = ? AND check_source = 'manual' AND status IN ('queued', 'processing')`,
      args: [userId]
    })

    // Insert Job
    statements.push({
      sql: `INSERT INTO visa_check_jobs (id, userId, total, status, check_source, createdAt, updatedAt)
            VALUES (?, ?, ?, 'queued', 'manual', ?, ?)`,
      args: [jobId, userId, ownedPassports.length, now, now]
    })

    // Insert Tasks
    for (const passport of ownedPassports) {
      const taskId = crypto.randomUUID()
      statements.push({
        sql: `INSERT INTO visa_check_tasks (id, jobId, userId, passport, status, attempts, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)`,
        args: [taskId, jobId, userId, passport, now, now]
      })
    }

    await db.batch(statements, 'write')
  } catch (err: unknown) {
    console.error('[Jobs API] Failed to create job batch:', err instanceof Error ? err.message : String(err))
    apiError(500, 'Failed to create job queue.')
  }

  // 6. Trigger the worker over loopback.
  // Previously this went out through the public host header and back in via the
  // reverse proxy — any proxy timeout, rate limit, or DNS quirk silently killed
  // the trigger (the failure is only logged), leaving the job stuck at 'queued'.
  // Loopback matches how the worker chains itself and skips the proxy entirely.
  const port = process.env.PORT || process.env.NITRO_PORT || '3000'
  const workerUrl = `http://127.0.0.1:${port}/api/jobs/worker`

  console.log(`[Jobs API] Triggering worker at: ${workerUrl}`)
  // Detached: the worker runs for minutes, so we only need the request to be
  // sent, not answered. A timeout here means it started — not that it failed.
  // `event.waitUntil` is deliberately not used: it is a no-op outside the
  // serverless presets, which is what made this trigger unreliable on a VPS.
  $fetch(workerUrl, { method: 'POST', timeout: 5000 }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/timeout|aborted/i.test(msg)) {
      console.error('[Jobs API] Worker trigger request failed:', msg)
    }
  })

  // 7. Return job info
  return {
    jobId,
    total: ownedPassports.length,
    status: 'queued'
  }
})
