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
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued')) return 'approved'
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled'
  if (s.includes('received') || s.includes('app/')) return 'received'
  if (s.includes('under review')) return 'under review'
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

  // 3.1. Smart recent check cache (skip redundant external calls within 60s unless forced)
  const lastCheckedMs = student.lastChecked ? Date.parse(String(student.lastChecked)) : 0
  const isRecentlyChecked = !body.force && lastCheckedMs && (Date.now() - lastCheckedMs < 60_000)
  if (isRecentlyChecked && student.status && student.status !== 'Pending') {
    return {
      passport,
      status: oldStatus,
      applicationDate: String(student.applicationDate || student.application_date || ''),
      lastChecked: String(student.lastChecked),
      rejectReason: String(student.rejectReason || ''),
      pdfUrl: String(student.pdfUrl || ''),
      statusChanged: false,
      oldStatus,
      cached: true
    }
  }

  // 4. Run visa check directly (synchronous — fast-fail in 6.5s)
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

    // Persist lastChecked to DB so F5 refresh reflects the check attempt
    const nowIso = new Date().toISOString()
    const dbWriteStartedAt = performance.now()
    await db.execute({
      sql: `UPDATE students SET lastChecked = ?, last_checked = ? WHERE passport = ? AND userId = ? AND deletedAt IS NULL`,
      args: [nowIso, nowIso, passport, userId]
    }).catch(dbErr => console.error('[Direct Check] DB update error on fallback:', dbErr))
    console.warn(`[Direct Check Timing] passport=${passport} portal=${Math.round(performance.now() - visaStartedAt)}ms dbWrite=${Math.round(performance.now() - dbWriteStartedAt)}ms total=${Math.round(performance.now() - requestStartedAt)}ms failed=true`)

    return {
      passport,
      status: oldStatus,
      applicationDate: String(student.applicationDate || student.application_date || ''),
      lastChecked: nowIso,
      rejectReason: String(student.rejectReason || ''),
      pdfUrl: String(student.pdfUrl || ''),
      statusChanged: false,
      oldStatus,
      error: errorObj.message || 'Failed to connect to visa portal'
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
    oldStatus
  }
})
