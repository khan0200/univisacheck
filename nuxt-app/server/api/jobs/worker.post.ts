/**
 * server/api/jobs/worker.post.ts
 *
 * Optimized Serverless-compatible queue worker.
 * Establishes a global scheduler lock, claims tasks atomically,
 * dispatches check status requests every 200ms asynchronously (non-blocking),
 * and handles database writes, Telegram, and realtime updates per student.
 */

import type { H3Event } from 'h3'
import { getTursoClient, type TursoDbClient, type QueryResult } from '../../utils/turso'
import { checkStudentVisaStatus } from '../../lib/visa'
import { publishRealtime } from '../../utils/realtime-publisher'
import { sendTelegramNotification } from '../../utils/telegram-notifier'
import { tryCreateProcessingNotification } from '../../utils/processing-notifier'

interface WorkerTask {
  id: string
  passport: string
  userId: number
  jobId: string
  createdAt: string
  checkSource: string
}

interface WorkerStudent {
  status?: string
  fullName?: string
  fullname?: string
  birthday?: string
  visaType?: string
  visa_type?: string
  applicationNo?: string
  application_no?: string
  telegram_user_id?: number | null
  studentId?: string
  student_id?: string
  applicationDate?: string
  lastChecked?: string
}

// visa.go.kr starts timing out when too many lookups are in flight. Tasks are
// still launched on a 200ms cadence, but this ceiling protects the portal and
// keeps a slow response from turning the entire batch into timeouts.
const MAX_CONCURRENT_PORTAL_CHECKS = 6

// Normalize status matching utils/visa-status.ts
function normalizeStatus(status: string): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) return 'pending'
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued')) return 'approved'
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled'
  if (s.includes('received') || s.includes('app/')) return 'received'
  if (s.includes('under review')) return 'under review'
  return s
}

// Compare statuses matching utils/visa-status.ts
function isSameStatus(status1: string, status2: string): boolean {
  return normalizeStatus(status1) === normalizeStatus(status2)
}

// Helper: Try to acquire scheduler lock
async function acquireSchedulerLock(db: TursoDbClient, workerId: string): Promise<boolean> {
  const now = Date.now()
  const expiryTime = now - 5000 // 5 seconds expiry

  // Try to update an expired lock or a lock held by nobody
  const res = await db.execute({
    sql: `UPDATE visa_scheduler_lock 
          SET locked_by = ?, locked_at = ? 
          WHERE id = 'global' AND (locked_by = '' OR locked_at < ?)`,
    args: [workerId, now, expiryTime]
  })

  if (res.rowsAffected > 0) {
    return true
  }

  // If the row doesn't exist yet, try to insert it (handling conflict)
  try {
    const insertRes = await db.execute({
      sql: `INSERT OR IGNORE INTO visa_scheduler_lock (id, locked_by, locked_at)
            VALUES ('global', ?, ?)`,
      args: [workerId, now]
    })
    if (insertRes.rowsAffected && insertRes.rowsAffected > 0) {
      return true
    }
  } catch {
    // Ignore insertion error, try update again
  }

  const res2 = await db.execute({
    sql: `UPDATE visa_scheduler_lock 
          SET locked_by = ?, locked_at = ? 
          WHERE id = 'global' AND (locked_by = '' OR locked_at < ?)`,
    args: [workerId, now, expiryTime]
  })
  return res2.rowsAffected > 0
}

// Helper: Renew scheduler lock
async function renewSchedulerLock(db: TursoDbClient, workerId: string): Promise<boolean> {
  const now = Date.now()
  const res = await db.execute({
    sql: `UPDATE visa_scheduler_lock SET locked_at = ? WHERE id = 'global' AND locked_by = ?`,
    args: [now, workerId]
  })
  return res.rowsAffected > 0
}

// Helper: Release scheduler lock
async function releaseSchedulerLock(db: TursoDbClient, workerId: string) {
  try {
    await db.execute({
      sql: `UPDATE visa_scheduler_lock SET locked_by = '', locked_at = 0 WHERE id = 'global' AND locked_by = ?`,
      args: [workerId]
    })
  } catch (err) {
    console.error(`[Lock] Failed to release lock:`, err)
  }
}

// Helper: Database execute with retry for resilience
async function executeWithRetry(
  db: TursoDbClient,
  stmt: { sql: string, args?: unknown[] },
  retries = 3,
  delay = 100
): Promise<QueryResult> {
  for (let i = 0; i < retries; i++) {
    try {
      return await db.execute(stmt)
    } catch (err: unknown) {
      if (i === retries - 1) throw err
      console.warn(`[DB Retry] SQL execution failed, retrying in ${delay}ms... Error:`, err instanceof Error ? err.message : String(err))
      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= 2
    }
  }
  throw new Error('Retries failed')
}

// Async runner to perform scraping, DB writes, Telegram notification, and progress updates
async function runVisaCheckTask(db: TursoDbClient, claimedTask: WorkerTask, event: H3Event) {
  const runnerId = `runner-${claimedTask.id}`
  const taskStartedAt = performance.now()
  console.log(`[Task Runner] Starting task ${claimedTask.id} for passport ${claimedTask.passport}`)

  let success = false
  let errorMsg = ''
  let newStatus = 'Pending'
  let updatedChanges: Record<string, unknown> = {}

  const taskPromise = (async () => {
    try {
      // 1. Fetch student details with retry
      const studentRes = await executeWithRetry(db, {
        sql: 'SELECT * FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
        args: [claimedTask.passport, claimedTask.userId]
      })

      if (studentRes.rows.length === 0) {
        throw new Error('Student record no longer exists or was deleted.')
      }

      const student = studentRes.rows[0] as unknown as WorkerStudent
      const oldStatus = student.status || 'Pending'

      // DUPLICATE/RECENT CHECK OPTIMIZATION
      if (student.lastChecked && student.lastChecked >= claimedTask.createdAt) {
        console.log(`[Task Runner] Skip external check: passport ${claimedTask.passport} already updated on ${student.lastChecked}`)
        success = true
        newStatus = oldStatus
        updatedChanges = {
          status: oldStatus,
          lastChecked: student.lastChecked
        }
      } else {
        // Query visa.go.kr (external HTTP call, not retried in database loop)
        const portalStartedAt = performance.now()
        const liveResult = await checkStudentVisaStatus(
          claimedTask.passport,
          student.fullName || student.fullname || '',
          student.birthday || '',
          student.visaType || student.visa_type || 'Embassy',
          student.applicationNo || student.application_no || ''
        )
        const portalMs = performance.now() - portalStartedAt

        const nowIso = new Date().toISOString()
        newStatus = liveResult.found ? liveResult.latestStatus : oldStatus
        const statusChanged = !isSameStatus(oldStatus, newStatus)

        const checkSource = claimedTask.checkSource

        // Consolidate updates into ONE single database write with retry
        const appDate = liveResult.latestDate || student.applicationDate || ''
        const dbWriteStartedAt = performance.now()
        await executeWithRetry(db, {
          sql: `
            UPDATE students
            SET status = ?,
                applicationDate = ?,
                application_date = ?,
                lastChecked = ?,
                last_checked = ?,
                rejectReason = ?,
                pdfUrl = ?,
                apiResponse = ?,
                check_source = ?,
                checkSource = ?
            WHERE passport = ? AND userId = ? AND deletedAt IS NULL
          `,
          args: [
            newStatus,
            appDate,
            appDate,
            nowIso,
            nowIso,
            liveResult.rejectionReason || '',
            liveResult.pdfUrl || '',
            JSON.stringify(liveResult),
            checkSource,
            checkSource,
            claimedTask.passport,
            claimedTask.userId
          ]
        })
        const dbWriteMs = performance.now() - dbWriteStartedAt

        updatedChanges = {
          status: newStatus,
          applicationDate: appDate,
          lastChecked: nowIso,
          rejectReason: liveResult.rejectionReason || '',
          pdfUrl: liveResult.pdfUrl || '',
          apiResponse: JSON.stringify(liveResult),
          check_source: checkSource,
          checkSource: checkSource
        }

        // Log notification row if status changed
        if (statusChanged) {
          await executeWithRetry(db, {
            sql: `INSERT INTO notifications (telegram_user_id, student_id, old_status, new_status, created_at)
                  VALUES (?, ?, ?, ?, datetime('now'))`,
            args: [student.telegram_user_id || null, claimedTask.passport, oldStatus, newStatus]
          })

          // Trigger Telegram notification asynchronously (non-blocking)
          sendTelegramNotification(claimedTask.userId, {
            fullName: student.fullName || student.fullname || '',
            passport: claimedTask.passport,
            studentId: student.studentId || student.student_id || '',
            visaType: student.visaType || student.visa_type || 'Embassy',
            applicationNo: student.applicationNo || student.application_no || '',
            birthday: student.birthday || '',
            oldStatus,
            newStatus,
            applicationDate: appDate,
            rejectionReason: liveResult.rejectionReason || '',
            previousRejectionReason: liveResult.previousRejectionReason || '',
            invitingCompany: liveResult.invitingCompany || '',
            entryDate: liveResult.entryDate || '',
            pdfUrl: liveResult.pdfUrl || ''
          }).catch((tErr) => {
            const errorText = tErr instanceof Error ? tErr.message : String(tErr)
            console.error('[Task Runner Telegram Notifier] Error:', errorText)
          })
        }

        if (liveResult.found && appDate) {
          tryCreateProcessingNotification(
            db,
            appDate,
            student.visaType || student.visa_type || 'Embassy',
            claimedTask.userId,
            claimedTask.passport
          ).catch((tErr) => {
            const errText = tErr instanceof Error ? tErr.message : String(tErr)
            console.error('[Worker ProcessingNotifier] Error:', errText)
          })
        }

        success = true
        console.log(`[Queue Task Timing] passport=${claimedTask.passport} portal=${Math.round(portalMs)}ms dbWrite=${Math.round(dbWriteMs)}ms total=${Math.round(performance.now() - taskStartedAt)}ms status=${newStatus}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Task Runner] Task ${claimedTask.id} execution failed:`, msg)
      errorMsg = msg
    }

    // 4. Update task state
    try {
      if (success) {
        await executeWithRetry(db, {
          sql: 'UPDATE visa_check_tasks SET status = \'completed\', completedAt = datetime(\'now\'), error = NULL, updatedAt = datetime(\'now\') WHERE id = ?',
          args: [claimedTask.id]
        })

        // Send realtime event for student updated to all consultings that hold this passport
        if (Object.keys(updatedChanges).length > 0) {
          await publishRealtime(claimedTask.userId, {
            type: 'student.updated',
            eventId: crypto.randomUUID(),
            updatedAt: new Date().toISOString(),
            originClientId: runnerId,
            passport: claimedTask.passport,
            changes: updatedChanges
          }).catch((err) => {
            console.error(`[Worker Realtime] Failed for userId ${claimedTask.userId}:`, err)
          })
        }
      } else {
        // Retry logic with backoff
        const attemptsRes = await executeWithRetry(db, {
          sql: 'SELECT attempts FROM visa_check_tasks WHERE id = ?',
          args: [claimedTask.id]
        })
        const attempts = attemptsRes.rows[0] ? Number(attemptsRes.rows[0].attempts) : 1

        if (attempts < 3) {
          const delaySeconds = 30 * Math.pow(2, attempts - 1) // 30s, 60s
          const retryAt = new Date(Date.now() + (delaySeconds * 1000)).toISOString()
          console.log(`[Task Runner] Task ${claimedTask.id} backing off for ${delaySeconds}s...`)
          await executeWithRetry(db, {
            sql: `UPDATE visa_check_tasks
                  SET status = 'queued', lockedAt = ?, lockedBy = NULL, updatedAt = datetime('now')
                  WHERE id = ?`,
            args: [retryAt, claimedTask.id]
          })
        } else {
          await executeWithRetry(db, {
            sql: 'UPDATE visa_check_tasks SET status = \'failed\', error = ?, completedAt = datetime(\'now\'), updatedAt = datetime(\'now\') WHERE id = ?',
            args: [errorMsg || 'Failed after max retries', claimedTask.id]
          })
        }
      }

      // Update overall job status and trigger progress events
      const jobStatsRes = await executeWithRetry(db, {
        sql: `SELECT status, COUNT(*) as count FROM visa_check_tasks WHERE jobId = ? GROUP BY status`,
        args: [claimedTask.jobId]
      })

      const counts: Record<string, number> = {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0
      }
      for (const row of jobStatsRes.rows) {
        counts[String(row.status)] = Number(row.count)
      }

      const totalRes = await executeWithRetry(db, {
        sql: 'SELECT total FROM visa_check_jobs WHERE id = ?',
        args: [claimedTask.jobId]
      })
      const total = totalRes.rows[0] ? Number(totalRes.rows[0].total) : 0

      const isJobDone = counts.queued === 0 && counts.processing === 0
      let jobStatus = 'processing'

      if (isJobDone) {
        jobStatus = counts.completed === total ? 'completed' : (counts.cancelled || 0) > 0 ? 'cancelled' : 'failed'
        await executeWithRetry(db, {
          sql: 'UPDATE visa_check_jobs SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?',
          args: [jobStatus, claimedTask.jobId]
        })
      }

      // Publish progress and completed task events
      await publishRealtime(claimedTask.userId, {
        type: 'visa_check.progress',
        jobId: claimedTask.jobId,
        total,
        status: jobStatus,
        progress: counts
      })

      await publishRealtime(claimedTask.userId, {
        type: 'visa_check.completed',
        jobId: claimedTask.jobId,
        studentId: claimedTask.passport,
        result: {
          status: newStatus,
          lastChecked: new Date().toISOString()
        }
      })
    } catch (err) {
      console.error(`[Task Runner] Error in task finalization:`, err)
    }
  })()

  event.waitUntil(taskPromise)
}

export default defineEventHandler(async (event) => {
  const db = await getTursoClient()
  const workerId = `worker-${crypto.randomUUID()}`
  const workerStartTime = Date.now()

  console.log(`[Queue Worker] Attempting start: ${workerId}`)

  // 1. Recover stale tasks and clean up abandoned queues
  try {
    // A. Clean up tasks belonging to inactive/cancelled jobs
    await db.execute({
      sql: `UPDATE visa_check_tasks
            SET status = 'cancelled', lockedAt = NULL, lockedBy = NULL, updatedAt = datetime('now')
            WHERE status IN ('queued', 'processing')
              AND jobId IN (
                SELECT id FROM visa_check_jobs WHERE status NOT IN ('queued', 'processing')
              )`
    })

    // B. Auto-cancel old stale jobs (> 2 hours old) still stuck in queued/processing
    await db.execute({
      sql: `UPDATE visa_check_jobs
            SET status = 'cancelled', updatedAt = datetime('now')
            WHERE status IN ('queued', 'processing')
              AND createdAt < datetime('now', '-2 hours')`
    })

    // C. Cancel all tasks of those old stale jobs
    await db.execute({
      sql: `UPDATE visa_check_tasks
            SET status = 'cancelled', lockedAt = NULL, lockedBy = NULL, updatedAt = datetime('now')
            WHERE status IN ('queued', 'processing')
              AND createdAt < datetime('now', '-2 hours')`
    })

    // D. Recover stale processing tasks (locked > 5 minutes)
    const recoveredRes = await db.execute({
      sql: `SELECT t.id, t.attempts, j.status as jobStatus FROM visa_check_tasks t
            LEFT JOIN visa_check_jobs j ON j.id = t.jobId
            WHERE t.status = 'processing' AND (t.lockedAt IS NULL OR t.lockedAt < datetime('now', '-5 minutes'))`
    })

    for (const row of recoveredRes.rows) {
      const taskId = String(row.id)
      const attempts = Number(row.attempts || 0)
      const jobStatus = row.jobStatus ? String(row.jobStatus) : ''

      if (!jobStatus || jobStatus === 'cancelled' || jobStatus === 'completed' || jobStatus === 'failed') {
        await db.execute({
          sql: `UPDATE visa_check_tasks SET status = 'cancelled', lockedAt = NULL, lockedBy = NULL, updatedAt = datetime('now') WHERE id = ?`,
          args: [taskId]
        })
        continue
      }

      if (attempts >= 3) {
        console.log(`[Queue Worker] Failing stale task ${taskId} (attempts = ${attempts}).`)
        await db.execute({
          sql: `UPDATE visa_check_tasks SET status = 'failed', error = 'Lease expired too many times', updatedAt = datetime('now') WHERE id = ?`,
          args: [taskId]
        })
      } else {
        console.log(`[Queue Worker] Re-queueing stale task ${taskId} (attempts = ${attempts}).`)
        await db.execute({
          sql: `UPDATE visa_check_tasks SET status = 'queued', lockedAt = NULL, lockedBy = NULL, updatedAt = datetime('now') WHERE id = ?`,
          args: [taskId]
        })
      }
    }
  } catch (err) {
    console.error('[Queue Worker] Error recovering stale tasks:', err)
  }

  // 2. Acquire global scheduler lock
  const acquired = await acquireSchedulerLock(db, workerId)
  if (!acquired) {
    console.log(`[Queue Worker] Global dispatcher lock held by another instance. Exiting: ${workerId}`)
    return { success: true, reason: 'lock_held' }
  }

  console.log(`[Queue Worker] Dispatcher lock acquired. Starting dispatch loop. Owner: ${workerId}`)

  // 3. Process loop (runs up to 45 seconds to stay safe from Vercel function timeout)
  let tasksDispatched = 0

  while (Date.now() - workerStartTime < 45000) {
    // A. Renew lock
    const hasLock = await renewSchedulerLock(db, workerId)
    if (!hasLock) {
      console.log(`[Queue Worker] Lost scheduler lock. Exiting loop. Owner: ${workerId}`)
      break
    }

    // Maintain the staggered 200ms launch rate without overwhelming
    // visa.go.kr. This is a global count because the scheduler lock ensures
    // this is the only dispatcher instance claiming work.
    const activeCountRes = await db.execute({
      sql: `SELECT COUNT(*) as activeCount FROM visa_check_tasks t
            INNER JOIN visa_check_jobs j ON j.id = t.jobId
            WHERE t.status = 'processing'
              AND j.status IN ('queued', 'processing')
              AND t.lockedAt > datetime('now', '-5 minutes')`
    })
    const activeCount = Number(activeCountRes.rows[0]?.activeCount ?? 0)
    if (activeCount >= MAX_CONCURRENT_PORTAL_CHECKS) {
      await new Promise(resolve => setTimeout(resolve, 200))
      continue
    }

    // B. Claim next task atomically using a write transaction
    let claimedTask: WorkerTask | undefined
    const tx = await db.transaction('write')
    try {
      // Select next task using fair scheduling
      const nextTaskRes = await tx.execute({
        sql: `
          SELECT t.id, t.passport, t.userId, t.jobId, t.createdAt, j.check_source
          FROM visa_check_tasks t
          INNER JOIN visa_check_jobs j ON j.id = t.jobId
          LEFT JOIN (
            SELECT userId, COUNT(*) as userActiveCount
            FROM visa_check_tasks
            WHERE status = 'processing' AND lockedAt > datetime('now', '-5 minutes')
            GROUP BY userId
          ) active ON t.userId = active.userId
          WHERE t.status = 'queued'
            AND j.status IN ('queued', 'processing')
            AND (t.lockedAt IS NULL OR t.lockedAt < datetime('now'))
            AND t.passport NOT IN (
              SELECT passport FROM visa_check_tasks
              WHERE status = 'processing' AND lockedAt > datetime('now', '-5 minutes')
            )
          ORDER BY COALESCE(active.userActiveCount, 0) ASC, t.createdAt ASC
          LIMIT 1
        `
      })

      if (nextTaskRes.rows.length > 0) {
        const task = nextTaskRes.rows[0] as unknown as Record<string, unknown>
        claimedTask = {
          id: String(task.id),
          passport: String(task.passport),
          userId: Number(task.userId),
          jobId: String(task.jobId),
          createdAt: String(task.createdAt),
          checkSource: String(task.check_source || 'manual')
        }

        // Lock task
        await tx.execute({
          sql: `UPDATE visa_check_tasks
                SET status = 'processing', lockedAt = datetime('now'), lockedBy = ?, startedAt = datetime('now'), attempts = attempts + 1
                WHERE id = ?`,
          args: [workerId, claimedTask.id]
        })

        // Update overall job status if it was queued
        await tx.execute({
          sql: 'UPDATE visa_check_jobs SET status = \'processing\', updatedAt = datetime(\'now\') WHERE id = ? AND status = \'queued\'',
          args: [claimedTask.jobId]
        })
      }

      await tx.commit()
    } catch (err) {
      try {
        await tx.rollback()
      } catch {
        // Rollback ignored
      }
      console.error('[Queue Worker] Claim transaction failed:', err)
      break
    }

    if (!claimedTask) {
      console.log(`[Queue Worker] No queued tasks available. Releasing lock and exiting loop. Owner: ${workerId}`)
      await releaseSchedulerLock(db, workerId)
      break
    }

    // C. Dispatch task asynchronously (non-blocking!)
    tasksDispatched++

    // First, publish a realtime event to indicate that the check has started for this student
    // This allows the frontend to change the student row status to 'processing'
    publishRealtime(claimedTask.userId, {
      type: 'visa_check.started',
      jobId: claimedTask.jobId,
      studentId: claimedTask.passport
    }).catch((err) => {
      console.error('[Queue Worker] Failed to publish visa_check.started event:', err)
    })

    runVisaCheckTask(db, claimedTask, event)

    // D. Sleep 200ms before starting the next loop iteration (enforcing global 200ms rate limit)
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  // 4. Chain the next worker. Delayed retries also schedule their own wake-up,
  // otherwise a failed task could remain queued forever with no new request.
  try {
    const queuedCountRes = await db.execute({
      sql: `SELECT COUNT(*) as queuedCount,
                   MIN(CASE WHEN t.lockedAt IS NOT NULL AND t.lockedAt > datetime('now') THEN t.lockedAt END) as nextLockedAt
            FROM visa_check_tasks t
            INNER JOIN visa_check_jobs j ON j.id = t.jobId
            WHERE t.status = 'queued'
              AND j.status IN ('queued', 'processing')`
    })
    const queuedCount = Number(queuedCountRes.rows[0]?.queuedCount ?? 0)

    if (queuedCount > 0) {
      await releaseSchedulerLock(db, workerId)

      const nextLockedAt = String(queuedCountRes.rows[0]?.nextLockedAt || '')
      const retryAtMs = Date.parse(nextLockedAt)
      const delayMs = Number.isNaN(retryAtMs)
        ? 0
        : Math.min(Math.max(retryAtMs - Date.now() + 50, 0), 60_000)

      const port = process.env.PORT || '3000'
      const workerUrl = `http://127.0.0.1:${port}/api/jobs/worker`

      console.log(`[Queue Worker] Chaining next worker execution. Queued count: ${queuedCount}, delay: ${delayMs}ms`)
      const triggerPromise = (async () => {
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
        await $fetch(workerUrl, { method: 'POST' })
      })().catch((err: unknown) => {
        console.error('[Queue Worker] Chained trigger failed:', err instanceof Error ? err.message : String(err))
      })
      event.waitUntil(triggerPromise)
    }
  } catch (err) {
    console.error('[Queue Worker] Chaining check failed:', err)
  }

  console.log(`[Queue Worker] Completed execution for worker: ${workerId}. Tasks dispatched: ${tasksDispatched}`)
  return { success: true, tasksDispatched }
})
