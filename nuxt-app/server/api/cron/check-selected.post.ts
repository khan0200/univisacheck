/**
 * server/api/cron/check-selected.post.ts
 *
 * 10-MINUTE CRON ENDPOINT (High-Performance Parallel Engine)
 *
 * Eligibility Rules for Selected Students in Application Tab (batchSelected = 1):
 * - Checks ONLY selected students in the Application tab (status != 'Pending').
 * - Excludes final statuses ('approved', 'cancelled', 'rejected', etc.) and 'pending'.
 * - Auto-checks if:
 *   Condition A: status is "Under Review" or "Pending Supplement" (regardless of app date).
 *   OR
 *   Condition B: applicationDate is 10 or more days ago.
 */

import { getTursoClient } from '../../utils/turso'
import { checkStudentVisaStatus } from '../../lib/visa'
import { publishRealtime } from '../../utils/realtime-publisher'
import { sendTelegramNotification } from '../../utils/telegram-notifier'

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

  // 1.5 Apply Korean Standard Time (KST) night-mode check:
  // - 09:00 to 21:00 KST: Run every 10 minutes (always)
  // - 21:00 to 08:59 KST: Run every 3 hours (at 21:00, 00:00, 03:00, 06:00 KST)
  const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const kstHour = kstDate.getHours()
  const kstMinute = kstDate.getMinutes()

  const isDaytime = kstHour >= 9 && kstHour < 21

  if (!isDaytime) {
    const isNightCheckHour = kstHour === 21 || kstHour === 0 || kstHour === 3 || kstHour === 6
    const isTriggerSlot = isNightCheckHour && kstMinute < 10

    if (!isTriggerSlot) {
      return {
        success: true,
        message: `Skipped: 10-Minute check is currently in night mode (current KST: ${String(kstHour).padStart(2, '0')}:${String(kstMinute).padStart(2, '0')}).`,
        checkedCount: 0
      }
    }
  }

  const db = await getTursoClient()

  // 2. Fetch all active selected students in Application tab (excluding 'pending' and final statuses)
  const studentsRes = await db.execute({
    sql: `SELECT passport, "userId", "fullName", fullname, birthday, "visaType", visa_type, "applicationNo", application_no, "studentId", student_id, "applicationDate", "lastChecked", status FROM students
          WHERE deletedAt IS NULL
            AND batchSelected = 1
            AND status IS NOT NULL
            AND LOWER(status) NOT IN ('pending', 'approved', 'visa used', 'cancelled', 'rejected', 'passport returned')`,
    args: []
  })

  // 3. Filter by Eligibility Rules:
  // - Condition A: status is Under Review / Pending Supplement (regardless of app date)
  // OR
  // - Condition B: applicationDate >= 10 days ago
  const eligibleRows = studentsRes.rows.filter((row: Record<string, unknown>) => {
    const appDate = String(row.applicationDate || '')
    const statusRaw = String(row.status || '').toLowerCase()
    const daysSinceApplied = getDaysSinceApplication(appDate)

    const isUnderReview = statusRaw.includes('under review')
    const isSupplement = statusRaw.includes('supplement') || statusRaw.includes('asking')
    const isLocalStatus = statusRaw.includes('topshirilgan') || statusRaw.includes('ko\'rib chiqilmoqda')
    const isUnderReviewOrSupplement = isUnderReview || isSupplement || isLocalStatus

    const isApplied10DaysOrMore = Boolean(appDate) && daysSinceApplied >= 10

    return isUnderReviewOrSupplement || isApplied10DaysOrMore
  })

  if (eligibleRows.length === 0) {
    return {
      success: true,
      message: 'No selected Application tab students currently match the 10-minute check rules.',
      checkedCount: 0
    }
  }

  console.log(`[10-Min Cron] Running staggered wave auto-check for ${eligibleRows.length} student(s)...`)

  const BATCH_SIZE = 3
  const BATCH_DELAY = 200
  let completedCount = 0
  let failedCount = 0

  async function checkStudent(student: Record<string, unknown>): Promise<void> {
    const passport = String(student.passport || '').toUpperCase().trim()
    const userId = Number(student.userId)
    const oldStatus = String(student.status || 'Pending')

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
      const statusChanged = normalizeStatus(oldStatus) !== normalizeStatus(newStatus)
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
        originClientId: 'cron-10m',
        passport,
        changes: updatedChanges
      }).catch(() => {})

      // Telegram notification if status changed
      if (statusChanged) {
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
      console.error(`[10-Min Cron] Check failed for ${passport}:`, err instanceof Error ? err.message : String(err))
    }
  }

  // Staggered wave dispatcher: Launch batches of 3 every 200ms without awaiting
  const allPromises: Promise<void>[] = []

  for (let i = 0; i < eligibleRows.length; i += BATCH_SIZE) {
    const batch = eligibleRows.slice(i, i + BATCH_SIZE) as Record<string, unknown>[]

    for (const student of batch) {
      allPromises.push(checkStudent(student))
    }

    if (i + BATCH_SIZE < eligibleRows.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }

  await Promise.allSettled(allPromises)

  console.log(`[10-Min Cron] Finished! Completed: ${completedCount}, Failed: ${failedCount}`)

  return {
    success: true,
    message: `Completed 10-minute auto check for ${completedCount} student(s) (${failedCount} failed).`,
    checkedCount: completedCount,
    failedCount
  }
})
