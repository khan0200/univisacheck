/**
 * server/api/jobs/worker.post.ts
 *
 * Serverless-compatible queue worker.
 * Processes tasks with global concurrency controls, fair scheduling, and retry recovery.
 */

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

export default defineEventHandler(async (event) => {
  const db = await getTursoClient()
  const workerId = `worker-${crypto.randomUUID()}`
  const workerStartTime = Date.now()

  console.log(`[Queue Worker] Started execution: ${workerId}`)

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
        console.log(`[Queue Worker] Failing task ${taskId} (attempts = ${attempts}) due to expired lease.`)
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Queue Worker] Error recovering stale tasks:', msg)
  }

  // 2. Load max concurrency limit
  const VISA_CHECK_MAX_CONCURRENCY = Number(process.env.VISA_CHECK_MAX_CONCURRENCY || '3')

  // 3. Process loop (up to 40 seconds to prevent Vercel execution timeouts)
  let tasksProcessed = 0
  while (Date.now() - workerStartTime < 40000) {
    let claimedTask: WorkerTask | undefined

    // Atomically claim the next task using a Turso write transaction
    const tx = await db.transaction('write')
    try {
      // Check active count
      const activeRes = await tx.execute({
        sql: `SELECT COUNT(*) as activeCount FROM visa_check_tasks
              WHERE status = 'processing' AND lockedAt > datetime('now', '-5 minutes')`
      })
      const activeCount = Number(activeRes.rows[0]?.activeCount ?? 0)

      if (activeCount >= VISA_CHECK_MAX_CONCURRENCY) {
        console.log(`[Queue Worker] Concurrency limit (${VISA_CHECK_MAX_CONCURRENCY}) reached. Active processing: ${activeCount}`)
        await tx.commit()
        break
      }

      // Claim next task using fair scheduling
      // Select the user with the lowest number of active tasks who has queued tasks,
      // and pick their oldest queued task. Exclude student passports already being processed.
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

      if (nextTaskRes.rows.length === 0) {
        await tx.commit()
        break // No queued tasks available to claim
      }

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

      await tx.commit()
    } catch (err) {
      try {
        await tx.rollback()
      } catch {
        // Rollback failed/ignored
      }
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Queue Worker] Claim transaction failed:', msg)
      break
    }

    if (!claimedTask) break

    // Process claimed task
    console.log(`[Queue Worker] Claimed task ${claimedTask.id} for passport ${claimedTask.passport}`)
    tasksProcessed++

    let success = false
    let errorMsg = ''
    let newStatus = 'Pending'

    try {
      // Fetch student details
      const studentRes = await db.execute({
        sql: 'SELECT * FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
        args: [claimedTask.passport, claimedTask.userId]
      })

      if (studentRes.rows.length === 0) {
        throw new Error('Student record no longer exists or was deleted.')
      }

      const student = studentRes.rows[0] as unknown as WorkerStudent
      const oldStatus = student.status || 'Pending'

      // DUPLICATE/RECENT CHECK OPTIMIZATION
      // If the student has already been checked after this task was queued, skip the external check.
      if (student.lastChecked && student.lastChecked >= claimedTask.createdAt) {
        console.log(`[Queue Worker] Skip external check: passport ${claimedTask.passport} already updated on ${student.lastChecked}`)
        success = true
        newStatus = oldStatus
      } else {
        // Query visa.go.kr
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

        // Consolidate updates into ONE single database write
        await db.execute({
          sql: `
            UPDATE students
            SET status = ?,
                applicationDate = ?,
                application_date = ?,
                lastChecked = ?,
                last_checked = ?,
                rejectReason = ?,
                pdfUrl = ?,
                apiResponse = ?
            WHERE passport = ? AND userId = ? AND deletedAt IS NULL
          `,
          args: [
            newStatus,
            liveResult.latestDate || student.applicationDate || '',
            liveResult.latestDate || student.applicationDate || '',
            nowIso,
            nowIso,
            liveResult.rejectionReason || '',
            liveResult.pdfUrl || '',
            JSON.stringify(liveResult),
            claimedTask.passport,
            claimedTask.userId
          ]
        })

        // Log notification row if status changed
        if (statusChanged) {
          await db.execute({
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
            applicationDate: liveResult.latestDate || student.applicationDate || '',
            rejectionReason: liveResult.rejectionReason || '',
            previousRejectionReason: liveResult.previousRejectionReason || '',
            invitingCompany: liveResult.invitingCompany || '',
            entryDate: liveResult.entryDate || '',
            pdfUrl: liveResult.pdfUrl || ''
          }).catch((tErr) => {
            const errorText = tErr instanceof Error ? tErr.message : String(tErr)
            console.error('[Queue Worker Telegram Notifier] Error:', errorText)
          })
        }

        // ── Visa processing started notification ──────────────────────────
        // Trigger only on real UNDER REVIEW results with a known applicationDate.
        // Fire-and-forget: does NOT block the visa check completion.
        const isUnderReview = normalizeStatus(newStatus) === 'under review'
        const appDate = liveResult.latestDate || student.applicationDate || ''
        if (isUnderReview && appDate) {
          tryCreateProcessingNotification(
            db,
            appDate,
            student.visaType || student.visa_type || 'Embassy',
            claimedTask.userId,
            claimedTask.passport
          ).catch((tErr) => {
            const errText = tErr instanceof Error ? tErr.message : String(tErr)
            console.error('[Queue Worker ProcessingNotifier] Error:', errText)
          })
        }

        success = true
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Queue Worker] Task ${claimedTask.id} failed:`, msg)
      errorMsg = msg
    }

    // 4. Update task state
    if (success) {
      await db.execute({
        sql: 'UPDATE visa_check_tasks SET status = \'completed\', completedAt = datetime(\'now\'), error = NULL, updatedAt = datetime(\'now\') WHERE id = ?',
        args: [claimedTask.id]
      })

      // Send realtime event for student updated
      await publishRealtime(claimedTask.userId, {
        type: 'student.updated',
        eventId: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        originClientId: workerId,
        passport: claimedTask.passport,
        changes: {
          status: newStatus,
          lastChecked: new Date().toISOString()
        }
      })
    } else {
      // Exponential retry backoff logic (Attempts 1, 2 retried with delay; Attempt 3 fails)
      const attemptsRes = await db.execute({
        sql: 'SELECT attempts FROM visa_check_tasks WHERE id = ?',
        args: [claimedTask.id]
      })
      const attempts = attemptsRes.rows[0] ? Number(attemptsRes.rows[0].attempts) : 1

      if (attempts < 3) {
        const delaySeconds = 30 * Math.pow(2, attempts - 1) // 30s, 60s
        console.log(`[Queue Worker] Task ${claimedTask.id} backing off for ${delaySeconds}s...`)
        await db.execute({
          sql: `UPDATE visa_check_tasks
                SET status = 'queued', lockedAt = datetime('now', '+' + ? + ' seconds'), lockedBy = NULL, updatedAt = datetime('now')
                WHERE id = ?`,
          args: [delaySeconds, claimedTask.id]
        })
      } else {
        await db.execute({
          sql: 'UPDATE visa_check_tasks SET status = \'failed\', error = ?, completedAt = datetime(\'now\'), updatedAt = datetime(\'now\') WHERE id = ?',
          args: [errorMsg || 'Failed after max retries', claimedTask.id]
        })
      }
    }

    // 5. Update overall job status and trigger progress events
    // Count tasks for this job
    const jobStatsRes = await db.execute({
      sql: `SELECT status, COUNT(*) as count FROM visa_check_tasks
            WHERE jobId = ? GROUP BY status`,
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

    const totalRes = await db.execute({
      sql: 'SELECT total FROM visa_check_jobs WHERE id = ?',
      args: [claimedTask.jobId]
    })
    const total = totalRes.rows[0] ? Number(totalRes.rows[0].total) : 0

    const isJobDone = counts.queued === 0 && counts.processing === 0
    let jobStatus = 'processing'

    if (isJobDone) {
      jobStatus = counts.completed === total ? 'completed' : (counts.cancelled || 0) > 0 ? 'cancelled' : 'failed'
      await db.execute({
        sql: 'UPDATE visa_check_jobs SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?',
        args: [jobStatus, claimedTask.jobId]
      })
    }

    // Publish progress and completed task events to the user
    await publishRealtime(claimedTask.userId, {
      type: 'visa_check.progress',
      jobId: claimedTask.jobId,
      total,
      status: jobStatus,
      progress: counts as unknown as { queued: number, processing: number, completed: number, failed: number, cancelled: number }
    })

    await publishRealtime(claimedTask.userId, {
      type: 'visa_check.completed',
      jobId: claimedTask.jobId,
      studentId: claimedTask.passport,
      result: {
        status: newStatus
      }
    })
  }

  // 6. Chain worker execution if more tasks remain queued and eligible
  try {
    const queuedCountRes = await db.execute({
      sql: `SELECT COUNT(*) as queuedCount FROM visa_check_tasks
            WHERE status = 'queued' AND (lockedAt IS NULL OR lockedAt < datetime('now'))`
    })
    const queuedCount = Number(queuedCountRes.rows[0]?.queuedCount ?? 0)

    if (queuedCount > 0) {
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
      const host = event.node.req.headers.host || 'localhost:3100'
      const workerUrl = `${protocol}://${host}/api/jobs/worker`

      console.log(`[Queue Worker] Chaining next worker execution. Queued count: ${queuedCount}`)
      $fetch(workerUrl, {
        method: 'POST',
        timeout: 1000
      }).catch(() => {
        // Ignored chain failure
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Queue Worker] Chaining check failed:', msg)
  }

  console.log(`[Queue Worker] Execution completed for worker: ${workerId}. Tasks processed: ${tasksProcessed}`)
  return { success: true, tasksProcessed }
})
