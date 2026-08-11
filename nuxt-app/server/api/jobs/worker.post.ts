/**
 * server/api/jobs/worker.post.ts
 *
 * Optimized Serverless-compatible queue worker.
 * Establishes a global scheduler lock, claims tasks atomically,
 * dispatches check status requests every 500ms asynchronously (non-blocking),
 * and handles database writes, Telegram, and realtime updates per student.
 */

import type { Client } from '@libsql/client'
import type { H3Event } from 'h3'
import { getTursoClient } from '../../utils/turso'
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
async function acquireSchedulerLock(db: Client, workerId: string): Promise<boolean> {
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
async function renewSchedulerLock(db: Client, workerId: string): Promise<boolean> {
  const now = Date.now()
  const res = await db.execute({
    sql: `UPDATE visa_scheduler_lock SET locked_at = ? WHERE id = 'global' AND locked_by = ?`,
    args: [now, workerId]
  })
  return res.rowsAffected > 0
}

// Helper: Release scheduler lock
async function releaseSchedulerLock(db: Client, workerId: string) {
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
  db: Client,
  stmt: { sql: string, args?: (string | number | boolean | null)[] },
  retries = 3,
  delay = 100
): Promise<import('@libsql/client').ResultSet> {
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
async function runVisaCheckTask(db: Client, claimedTask: WorkerTask, event: H3Event) {
  const runnerId = `runner-${claimedTask.id}`
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
        const liveResult = await checkStudentVisaStatus(
          claimedTask.passport,
          student.fullName || student.fullname || '',
          student.birthday || '',
          student.visaType || student.visa_type || 'Embassy',
          student.applicationNo || student.application_no || ''
        )

        const nowIso = new Date().toISOString()
        newStatus = liveResult.found ? liveResult.latestStatus : oldStatus
        const statusChanged = !isSameStatus(oldStatus, newStatus)

        const checkSourceRes = await executeWithRetry(db, {
          sql: 'SELECT check_source FROM visa_check_jobs WHERE id = ?',
          args: [claimedTask.jobId]
        })
        const checkSource = checkSourceRes.rows[0] ? String(checkSourceRes.rows[0].check_source) : 'manual'

        // Consolidate updates into ONE single database write with retry
        const appDate = liveResult.latestDate || student.applicationDate || ''
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
            WHERE passport = ? AND deletedAt IS NULL
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
            claimedTask.passport
          ]
        })

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

        // Trigger on UNDER_REVIEW results with a known applicationDate.
        const isUnderReview = normalizeStatus(newStatus) === 'under review'
        if (isUnderReview && appDate) {
          const visaCategory = liveResult.statusOfResidence || student.visaType || student.visa_type || 'Noma\'lum'
          tryCreateProcessingNotification(
            db,
            appDate,
            visaCategory,
            claimedTask.userId,
            claimedTask.passport
          ).catch((tErr) => {
            const errText = tErr instanceof Error ? tErr.message : String(tErr)
            console.error('[Task Runner ProcessingNotifier] Error:', errText)
          })
        }

        success = true
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
          const userRowsRes = await executeWithRetry(db, {
            sql: 'SELECT DISTINCT userId FROM students WHERE passport = ? AND deletedAt IS NULL',
            args: [claimedTask.passport]
          })
          const targetUserIds = new Set<number>([claimedTask.userId])
          for (const row of userRowsRes.rows) {
            const uid = Number((row as Record<string, unknown>).userId)
            if (uid && !isNaN(uid)) targetUserIds.add(uid)
          }

          for (const targetUserId of targetUserIds) {
            await publishRealtime(targetUserId, {
              type: 'student.updated',
              eventId: crypto.randomUUID(),
              updatedAt: new Date().toISOString(),
              originClientId: runnerId,
              passport: claimedTask.passport,
              changes: updatedChanges
            }).catch((err) => {
              console.error(`[Worker Realtime] Failed for userId ${targetUserId}:`, err)
            })
          }
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
          console.log(`[Task Runner] Task ${claimedTask.id} backing off for ${delaySeconds}s...`)
          await executeWithRetry(db, {
            sql: `UPDATE visa_check_tasks
                  SET status = 'queued', lockedAt = datetime('now', '+' + ? + ' seconds'), lockedBy = NULL, updatedAt = datetime('now')
                  WHERE id = ?`,
            args: [delaySeconds, claimedTask.id]
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

  // 1. Recover stale tasks (locked > 5 minutes)
  try {
    const recoveredRes = await db.execute({
      sql: `SELECT id, attempts FROM visa_check_tasks
            WHERE status = 'processing' AND lockedAt < datetime('now', '-5 minutes')`
    })

    for (const row of recoveredRes.rows) {
      const taskId = String(row.id)
      const attempts = Number(row.attempts)

      if (attempts >= 3) {
        console.log(`[Queue Worker] Failing stale task ${taskId} (attempts = ${attempts}).`)
        await db.execute({
          sql: 'UPDATE visa_check_tasks SET status = \'failed\', error = \'Lease expired too many times\', updatedAt = datetime(\'now\') WHERE id = ?',
          args: [taskId]
        })
      } else {
        console.log(`[Queue Worker] Re-queueing stale task ${taskId} (attempts = ${attempts}).`)
        await db.execute({
          sql: 'UPDATE visa_check_tasks SET status = \'queued\', lockedAt = NULL, lockedBy = NULL, updatedAt = datetime(\'now\') WHERE id = ?',
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

    // B. Claim next task atomically using a write transaction
    let claimedTask: WorkerTask | undefined
    const tx = await db.transaction('write')
    try {
      // Select next task using fair scheduling
      const nextTaskRes = await tx.execute({
        sql: `
          SELECT t.id, t.passport, t.userId, t.jobId, t.createdAt
          FROM visa_check_tasks t
          LEFT JOIN (
            SELECT userId, COUNT(*) as userActiveCount
            FROM visa_check_tasks
            WHERE status = 'processing' AND lockedAt > datetime('now', '-5 minutes')
            GROUP BY userId
          ) active ON t.userId = active.userId
          WHERE t.status = 'queued'
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
          createdAt: String(task.createdAt)
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
    await publishRealtime(claimedTask.userId, {
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

  // 4. Chain next worker execution if more tasks remain queued and eligible
  try {
    const queuedCountRes = await db.execute({
      sql: `SELECT COUNT(*) as queuedCount FROM visa_check_tasks
            WHERE status = 'queued' AND (lockedAt IS NULL OR lockedAt < datetime('now'))`
    })
    const queuedCount = Number(queuedCountRes.rows[0]?.queuedCount ?? 0)

    if (queuedCount > 0) {
      // If we are exiting because of the 45s loop timeout, we must release the lock so the chained worker can acquire it
      if (Date.now() - workerStartTime >= 45000) {
        console.log(`[Queue Worker] 45s execution limit reached. Releasing lock for handoff.`)
        await releaseSchedulerLock(db, workerId)
      }

      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
      const host = event.node.req.headers.host || 'localhost:3100'
      const workerUrl = `${protocol}://${host}/api/jobs/worker`

      console.log(`[Queue Worker] Chaining next worker execution. Queued count: ${queuedCount}`)
      const triggerPromise = $fetch(workerUrl, {
        method: 'POST'
      }).catch((err: unknown) => {
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
