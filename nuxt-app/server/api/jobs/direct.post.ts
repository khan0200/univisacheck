/**
 * server/api/jobs/direct.post.ts
 *
 * Fast-path single-student visa check.
 * Runs the visa.go.kr query synchronously in the same request (no queue),
 * persists the result to the DB, and publishes a realtime event.
 * Used by the single-row "Check" button in the cabinet for instant feedback.
 */

import { getTursoClient } from '../../utils/turso'
import { verifyToken } from '../../utils/auth'
import { apiError } from '../../utils/api-error'
import { checkStudentVisaStatus } from '../../lib/visa'
import { publishRealtime } from '../../utils/realtime-publisher'
import { sendTelegramNotification } from '../../utils/telegram-notifier'
import { tryCreateProcessingNotification } from '../../utils/processing-notifier'

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
  // 1. Authenticate
  const authUser = await verifyToken(event)
  if (!authUser) apiError(401, 'Unauthorized')
  const userId = authUser.userId

  // 2. Parse body
  const body = await readBody(event)
  const passport = (body.passport || '').toUpperCase().trim()
  if (!passport) apiError(400, 'Missing passport field')

  const db = await getTursoClient()

  // 3. Load student (must be owned by this user)
  const studentRes = await db.execute({
    sql: 'SELECT * FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL LIMIT 1',
    args: [passport, userId]
  })

  if (studentRes.rows.length === 0) {
    apiError(404, 'Student not found or not owned by this account')
  }

  const student = studentRes.rows[0] as unknown as Record<string, unknown>
  const oldStatus = String(student.status || 'Pending')

  // 4. Run visa check directly (synchronous — no queue)
  console.log(`[Direct Check] Checking passport ${passport} for userId ${userId}`)
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

  // 5. Persist result to DB
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
          check_source = 'manual',
          checkSource = 'manual'
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
      passport,
      userId
    ]
  })

  // 6. Publish realtime update so all connected browsers refresh instantly
  const updatedChanges = {
    status: newStatus,
    applicationDate: appDate,
    lastChecked: nowIso,
    rejectReason: liveResult.rejectionReason || '',
    pdfUrl: liveResult.pdfUrl || '',
    apiResponse: JSON.stringify(liveResult),
    check_source: 'manual',
    checkSource: 'manual'
  }

  await publishRealtime(userId, {
    type: 'student.updated',
    eventId: crypto.randomUUID(),
    updatedAt: nowIso,
    originClientId: `direct-${passport}`,
    passport,
    changes: updatedChanges
  })

  // 7. Telegram notification if status changed
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
    }).catch((err) => {
      console.error('[Direct Check] Telegram notification error:', err instanceof Error ? err.message : String(err))
    })

    // Processing notification for Under Review
    if (normalizeStatus(newStatus) === 'under review' && appDate) {
      const visaCategory = liveResult.statusOfResidence || String(student.visaType || student.visa_type || "Unknown")
      tryCreateProcessingNotification(db, appDate, visaCategory, userId, passport).catch((err) => {
        console.error('[Direct Check] ProcessingNotifier error:', err instanceof Error ? err.message : String(err))
      })
    }
  }

  // 8. Return result immediately
  console.log(`[Direct Check] Completed for ${passport}: ${oldStatus} → ${newStatus}`)
  return {
    passport,
    status: newStatus,
    applicationDate: appDate,
    lastChecked: nowIso,
    rejectReason: liveResult.rejectionReason || '',
    pdfUrl: liveResult.pdfUrl || '',
    statusChanged,
    oldStatus
  }
})
