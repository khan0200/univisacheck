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
  let liveResult
  try {
    liveResult = await checkStudentVisaStatus(
      passport,
      String(student.fullName || student.fullname || ''),
      String(student.birthday || ''),
      String(student.visaType || student.visa_type || 'Embassy'),
      String(student.applicationNo || student.application_no || '')
    )
  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number, message?: string, code?: string }
    if (errorObj.statusCode) throw err
    const isTimeout = errorObj.code === 'ETIMEDOUT' || errorObj.code === 'ECONNRESET' || errorObj.code === 'ENOTFOUND' || (errorObj.message && errorObj.message.includes('ETIMEDOUT'))
    console.error(`[Direct Check] Network error checking passport ${passport}:`, errorObj.message || String(err))
    if (isTimeout) {
      apiError(504, 'Official visa portal (visa.go.kr) connection timed out. Please try again in a few moments.')
    }
    apiError(502, `Failed to connect to visa portal: ${errorObj.message || 'Unknown network error'}`)
  }

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

  const userRowsRes = await db.execute({
    sql: 'SELECT DISTINCT userId FROM students WHERE passport = ? AND deletedAt IS NULL',
    args: [passport]
  })
  const targetUserIds = new Set<number>([userId])
  for (const row of userRowsRes.rows) {
    const uid = Number((row as any).userId)
    if (uid && !isNaN(uid)) targetUserIds.add(uid)
  }

  for (const targetUserId of targetUserIds) {
    await publishRealtime(targetUserId, {
      type: 'student.updated',
      eventId: crypto.randomUUID(),
      updatedAt: nowIso,
      originClientId: `direct-${passport}`,
      passport,
      changes: updatedChanges
    }).catch((err) => {
      console.error(`[Direct Realtime] Failed for userId ${targetUserId}:`, err)
    })
  }

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
