import { checkStudentVisaStatus } from '../lib/visa'
import { getTursoClient } from '../utils/turso'
import { apiError } from '../utils/api-error'
import { publishRealtime } from '../utils/realtime-publisher'
import { sendTelegramNotification } from '../utils/telegram-notifier'
import { tryCreateProcessingNotification } from '../utils/processing-notifier'

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
  try {
    const body = await readBody(event)
    const passport = (body.passport_number || body.passport || '').toUpperCase().trim()
    const fullName = (body.english_name || body.full_name || '').toUpperCase().trim()
    const birthDate = (body.birth_date || body.date_of_birth || '').trim()
    const visaType = (body.visa_type || body.visaType || 'Embassy').trim()
    const applicationNo = (body.application_no || body.applicationNo || '').trim()

    if (!passport || !fullName || !birthDate) {
      apiError(400, 'Missing required fields: passport, english_name, birth_date')
    }

    // Direct, synchronous check (no queue, no polling lag)
    console.log(`[Check Status API] Direct checking ${passport} (${fullName}) via ${visaType}...`)
    const direct = await checkStudentVisaStatus(passport, fullName, birthDate, visaType, applicationNo)

    const db = await getTursoClient()

    // 1. Check if student exists in DB
    const studentRes = await db.execute({
      sql: 'SELECT * FROM students WHERE passport = ? AND deletedAt IS NULL',
      args: [passport]
    })

    if (studentRes.rows.length === 0) {
      // Save/upsert to bot_manual_refreshes so public passport lookup (e.g. Add Student modal in cabinet) can autofill name & birthday
      try {
        await db.execute({
          sql: `INSERT INTO bot_manual_refreshes (passport, fullname, birthday, visa_type, application_no, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(passport) DO UPDATE SET
                  fullname = excluded.fullname,
                  birthday = excluded.birthday,
                  visa_type = excluded.visa_type,
                  application_no = excluded.application_no,
                  updated_at = excluded.updated_at`,
          args: [passport, fullName, birthDate, visaType, applicationNo, new Date().toISOString()]
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Check Status] Failed to save to bot_manual_refreshes:', msg)
      }
    } else {
      // Student exists in DB: Update student record(s) with live result
      const nowIso = new Date().toISOString()
      const firstStudent = studentRes.rows[0] as unknown as Record<string, unknown>
      const oldStatus = String(firstStudent.status || 'Pending')
      const newStatus = direct.found ? direct.latestStatus : oldStatus
      const statusChanged = normalizeStatus(oldStatus) !== normalizeStatus(newStatus)
      const appDate = direct.latestDate || String(firstStudent.applicationDate || '')

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
          direct.rejectionReason || '',
          direct.pdfUrl || '',
          JSON.stringify(direct),
          passport
        ]
      })

      // Collect target user IDs and broadcast realtime update & notifications
      const updatedChanges = {
        status: newStatus,
        applicationDate: appDate,
        lastChecked: nowIso,
        rejectReason: direct.rejectionReason || '',
        pdfUrl: direct.pdfUrl || '',
        apiResponse: JSON.stringify(direct),
        check_source: 'manual',
        checkSource: 'manual'
      }

      const targetUserIds = new Set<number>()
      for (const row of studentRes.rows) {
        const uid = Number((row as Record<string, unknown>).userId)
        if (uid && !isNaN(uid)) targetUserIds.add(uid)
      }

      for (const targetUserId of targetUserIds) {
        publishRealtime(targetUserId, {
          type: 'student.updated',
          eventId: crypto.randomUUID(),
          updatedAt: nowIso,
          originClientId: `check-status-${passport}`,
          passport,
          changes: updatedChanges
        }).catch((err) => {
          console.error(`[Check Status Realtime] Failed for userId ${targetUserId}:`, err)
        })

        if (statusChanged) {
          sendTelegramNotification(targetUserId, {
            fullName: String(firstStudent.fullName || firstStudent.fullname || fullName),
            passport,
            studentId: String(firstStudent.studentId || firstStudent.student_id || ''),
            visaType: String(firstStudent.visaType || firstStudent.visa_type || visaType),
            applicationNo: String(firstStudent.applicationNo || firstStudent.application_no || applicationNo),
            birthday: String(firstStudent.birthday || birthDate),
            oldStatus,
            newStatus,
            applicationDate: appDate,
            rejectionReason: direct.rejectionReason || '',
            previousRejectionReason: direct.previousRejectionReason || '',
            invitingCompany: direct.invitingCompany || '',
            entryDate: direct.entryDate || '',
            pdfUrl: direct.pdfUrl || ''
          }).catch((err) => {
            console.error('[Check Status] Telegram notification error:', err instanceof Error ? err.message : String(err))
          })
        }
      }

      if (direct.found && appDate) {
        const firstUserId = Array.from(targetUserIds)[0] || 1
        const studentVisaType = String(firstStudent.visaType || firstStudent.visa_type || visaType)
        tryCreateProcessingNotification(db, appDate, studentVisaType, firstUserId, passport).catch((tErr) => {
          console.error('[Check Status ProcessingNotifier] Error:', tErr instanceof Error ? tErr.message : String(tErr))
        })
      }
    }

    return {
      found: direct.found,
      status: direct.latestStatus,
      detail: direct.latestStatusKorean || direct.latestStatus,
      applicationDate: direct.latestDate || '',
      rejectionReason: direct.rejectionReason || '',
      pdfUrl: direct.pdfUrl || '',
      rawHtml: '',
      previousRejectionReason: direct.previousRejectionReason || '',
      entryDate: direct.entryDate || '',
      entryPurpose: direct.entryPurpose || '',
      visaExpiry: direct.visaExpiry || '',
      visaKind: direct.visaKind || '',
      statusOfResidence: direct.statusOfResidence || '',
      invitingCompany: direct.invitingCompany || '',
      resultCount: 0,
      source: 'visa.go.kr'
    }
  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number, message?: string, code?: string }
    if (errorObj.statusCode) throw err
    const isTimeout = errorObj.code === 'ETIMEDOUT' || errorObj.code === 'ECONNRESET' || errorObj.code === 'ENOTFOUND' || (errorObj.message && errorObj.message.includes('ETIMEDOUT'))
    console.error('[Check Status] Error:', errorObj.message || String(err))
    if (isTimeout) {
      apiError(504, 'Official visa portal (visa.go.kr) connection timed out. Please try again in a few moments.')
    }
    apiError(502, `Failed to connect to visa portal: ${errorObj.message || 'Unknown network error'}`)
  }
})
