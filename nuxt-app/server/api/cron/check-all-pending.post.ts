/**
 * server/api/cron/check-all-pending.post.ts
 *
 * 6-HOUR CRON ENDPOINT (High-Performance Parallel Engine)
 *
 * Rules:
 * 1. Auto-checks ALL students in the Pending tab and Application tab.
 * 2. Checks `lastChecked` timestamp column before checking each student:
 *    - If `lastChecked` was LESS than 10 minutes ago -> IGNORE & SKIP student.
 *    - Only check students whose `lastChecked` is MORE than 10 minutes ago (or never checked).
 */

import { getTursoClient } from '../../utils/turso'
import { checkStudentVisaStatus } from '../../lib/visa'
import { publishRealtime } from '../../utils/realtime-publisher'
import { sendTelegramNotification } from '../../utils/telegram-notifier'

/** Calculate minutes elapsed since lastChecked timestamp. */
function getMinutesSinceLastChecked(lastCheckedStr: string): number {
  if (!lastCheckedStr) return Infinity
  const checkedDate = new Date(lastCheckedStr)
  if (isNaN(checkedDate.getTime())) return Infinity
  const diffMs = Date.now() - checkedDate.getTime()
  return Math.floor(diffMs / (1000 * 60))
}

function normalizeStatus(status: string): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) return 'pending'
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued')) return 'approved'
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled'
  if (s.includes('received') || s.includes('app/')) return 'received'
  if (s.includes('under review')) return 'under review'
  return s
}

export default defineEventHandler(async (event) => {
  // 1. Verify Secret Key
  const authHeader = getRequestHeader(event, 'authorization') || ''
  const cronSecret = process.env.CRON_SECRET || ''

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized: Invalid CRON_SECRET' })
  }

  const db = await getTursoClient()

  // 2. Query ALL non-deleted students with non-final status (Pending, Application, Received, Under Review, etc.)
  const studentsRes = await db.execute({
    sql: `SELECT passport, "userId", "fullName", fullname, birthday, "visaType", visa_type, "applicationNo", application_no, "studentId", student_id, "applicationDate", "lastChecked", status, "lastNotifiedStatus" FROM students
          WHERE deletedAt IS NULL
            AND (
              status IS NULL
              OR LOWER(status) NOT IN ('approved', 'visa used', 'cancelled', 'rejected', 'passport returned')
            )`,
    args: []
  })

  // 3. Filter out any student checked LESS than 10 minutes ago
  const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
    const lastChecked = String(row.lastChecked || '')
    const minutesSinceChecked = getMinutesSinceLastChecked(lastChecked)

    // Cooldown rule: if checked less than 10 minutes ago, SKIP!
    if (minutesSinceChecked < 10) {
      return false
    }

    return true
  })

  if (eligibleRows.length === 0) {
    return {
      success: true,
      message: 'All Pending and Application students were checked within the last 10 minutes. Skipped.',
      checkedCount: 0
    }
  }

  console.log(`[6-Hour Cron] Running blazing fast parallel check for ${eligibleRows.length} student(s)...`)

  // 4. Run direct parallel checks with 4 workers and gentle pacing
  const queue = [...eligibleRows] as Record<string, unknown>[]
  const CONCURRENCY = 4
  let completedCount = 0
  let failedCount = 0

  async function worker() {
    while (queue.length > 0) {
      const student = queue.shift()
      if (!student) break

      const passport = String(student.passport || '').toUpperCase().trim()
      const userId = Number(student.userId)
      const oldStatus = String(student.status || 'Pending')
      const lastNotifiedStatus = String(student.lastNotifiedStatus || '')

      try {
        const liveResult = await checkStudentVisaStatus(
          passport,
          String(student.fullName || student.fullname || ''),
          String(student.birthday || ''),
          String(student.visaType || student.visa_type || 'Embassy'),
          String(student.applicationNo || student.application_no || '')
        )

        const nowIso = new Date().toISOString()
        const newStatus = liveResult.found ? liveResult.latestStatus : oldStatus
        const shouldNotify = normalizeStatus(newStatus) !== normalizeStatus(lastNotifiedStatus)
        const appDate = liveResult.latestDate || String(student.applicationDate || '')

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
                apiResponse = ?,
                check_source = 'auto',
                checkSource = 'auto'
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
            passport
          ]
        })

        const updatedChanges = {
          status: newStatus,
          applicationDate: appDate,
          lastChecked: nowIso,
          rejectReason: liveResult.rejectionReason || '',
          pdfUrl: liveResult.pdfUrl || '',
          apiResponse: JSON.stringify(liveResult),
          check_source: 'auto',
          checkSource: 'auto'
        }

        // Realtime update to cabinet
        publishRealtime(userId, {
          type: 'student.updated',
          eventId: crypto.randomUUID(),
          updatedAt: nowIso,
          originClientId: 'cron-6h',
          passport,
          changes: updatedChanges
        }).catch(() => {})

        // Telegram notification only when result differs from last-notified (persistent dedup)
        if (shouldNotify) {
          await db.execute({
            sql: `UPDATE students SET "lastNotifiedStatus" = ?, last_notified_status = ? WHERE passport = ? AND deletedAt IS NULL`,
            args: [newStatus, newStatus, passport]
          })

          sendTelegramNotification(userId, {
            fullName: String(student.fullName || student.fullname || ''),
            passport,
            studentId: String(student.studentId || student.student_id || ''),
            visaType: String(student.visaType || student.visa_type || 'Embassy'),
            applicationNo: String(student.applicationNo || student.application_no || ''),
            birthday: String(student.birthday || ''),
            oldStatus,
            newStatus,
            applicationDate: appDate,
            rejectionReason: liveResult.rejectionReason || '',
            previousRejectionReason: liveResult.previousRejectionReason || '',
            invitingCompany: liveResult.invitingCompany || '',
            entryDate: liveResult.entryDate || '',
            pdfUrl: liveResult.pdfUrl || ''
          }).catch(() => {})
        }

        completedCount++
      } catch (err: unknown) {
        failedCount++
        console.error(`[6-Hour Cron] Check failed for ${passport}:`, err instanceof Error ? err.message : String(err))
      }

      await new Promise(r => setTimeout(r, 60))
    }
  }

  const workerCount = Math.min(CONCURRENCY, queue.length)
  const workers = Array.from({ length: workerCount }, () => worker())
  await Promise.all(workers)

  console.log(`[6-Hour Cron] Finished! Completed: ${completedCount}, Failed: ${failedCount}`)

  return {
    success: true,
    message: `Completed 6-hour auto check for ${completedCount} student(s) (${failedCount} failed).`,
    checkedCount: completedCount,
    failedCount
  }
})
