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

    // Insert Job
    statements.push({
      sql: `INSERT INTO visa_check_jobs (id, userId, total, status, createdAt, updatedAt)
            VALUES (?, ?, ?, 'queued', ?, ?)`,
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

  // 6. Trigger worker asynchronously (using H3 event.waitUntil to ensure execution)
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const host = event.node.req.headers.host || 'localhost:3100'
  const workerUrl = `${protocol}://${host}/api/jobs/worker`

  console.log(`[Jobs API] Triggering worker at: ${workerUrl}`)
  const triggerPromise = $fetch(workerUrl, {
    method: 'POST'
  }).then(() => {
    console.log('[Jobs API] Worker trigger request completed.')
  }).catch((err: unknown) => {
    console.error('[Jobs API] Worker trigger request failed:', err instanceof Error ? err.message : String(err))
  })

  event.waitUntil(triggerPromise)

  // 7. Return job info
  return {
    jobId,
    total: ownedPassports.length,
    status: 'queued'
  }
})
