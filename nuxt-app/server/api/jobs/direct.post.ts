/**
 * server/api/jobs/direct.post.ts
 *
 * Fast-path single-student visa check.
 * Runs the visa.go.kr query synchronously in the same request (fast-fail, no queue lag),
 * persists the result to the DB, and publishes a realtime event.
 * Used by the single-row "Check" button and the batched auto-check wave dispatcher.
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
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued') || s.includes('tasdiqlangan') || s.includes('ishlatilgan') || s.includes('허가') || s.includes('발급') || s.includes('사용완료')) return 'approved'
  if (s.includes('cancel') || s.includes('reject') || s.includes('bekor') || s.includes('rad') || s.includes('불허') || s.includes('취소') || s.includes('반려') || s.includes('returned')) return 'cancelled'
  if (s.includes('supplement submitted') || s.includes('supplement completed') || s.includes('보완완료') || s.includes('보완제출') || s.includes('보완접수')) return 'supplement submitted'
  if (s.includes('supplement') || s.includes('보완') || s.includes('qo\'shimcha') || s.includes('asking')) return 'supplement needed'
  if (s.includes('received') || s.includes('app/') || s.includes('qabul') || s.includes('접수') || s.includes('신청')) return 'received'
  if (s.includes('under review') || s.includes('ko\'rib') || s.includes('tayyorlanish') || s.includes('심사중') || s.includes('심사 중') || s.includes('처리중') || s.includes('처리 중')) return 'under review'
  return s
}

export default defineEventHandler(async (event) => {
  const requestStartedAt = performance.now()
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

  // 4. Run visa check directly (synchronous — live portal check)
  console.log(`[Direct Check] Checking passport ${passport} for userId ${userId}`)
  let liveResult
  const visaStartedAt = performance.now()
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
    console.error(`[Direct Check] Network error checking passport ${passport}:`, errorObj.message || String(err))

    const existingLastChecked = String(student.lastChecked || student.last_checked || '')
    console.warn(`[Direct Check Timing] passport=${passport} portal=${Math.round(performance.now() - visaStartedAt)}ms total=${Math.round(performance.now() - requestStartedAt)}ms failed=true`)

    return {
      passport,
      status: oldStatus,
      applicationDate: String(student.applicationDate || student.application_date || ''),
      lastChecked: existingLastChecked,
      rejectReason: String(student.rejectReason || ''),
      pdfUrl: String(student.pdfUrl || ''),
      statusChanged: false,
      oldStatus,
      error: errorObj.message || 'Failed to connect to visa portal',
      success: false
    }
  }

  const nowIso = new Date().toISOString()
  const portalMs = performance.now() - visaStartedAt
  const newStatus = liveResult.found ? liveResult.latestStatus : oldStatus
  const statusChanged = normalizeStatus(oldStatus) !== normalizeStatus(newStatus)
  const appDate = liveResult.latestDate || String(student.applicationDate || '')

  // 5. Persist result to DB
  const dbWriteStartedAt = performance.now()
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
  const dbWriteMs = performance.now() - dbWriteStartedAt

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

  const realtimeStartedAt = performance.now()
  await publishRealtime(userId, {
    type: 'student.updated',
    eventId: crypto.randomUUID(),
    updatedAt: nowIso,
    originClientId: `direct-${passport}`,
    passport,
    changes: updatedChanges
  }).catch((err) => {
    console.error(`[Direct Realtime] Failed for userId ${userId}:`, err)
  })
  const realtimeMs = performance.now() - realtimeStartedAt

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
  console.log(`[Direct Check Timing] passport=${passport} portal=${Math.round(portalMs)}ms dbWrite=${Math.round(dbWriteMs)}ms realtime=${Math.round(realtimeMs)}ms total=${Math.round(performance.now() - requestStartedAt)}ms status=${newStatus}`)
  return {
    passport,
    status: newStatus,
    applicationDate: appDate,
    lastChecked: nowIso,
    rejectReason: liveResult.rejectionReason || '',
    pdfUrl: liveResult.pdfUrl || '',
    statusChanged,
    oldStatus,
    success: true
  }
})
