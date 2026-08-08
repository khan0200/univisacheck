import { checkStudentVisaStatus } from '../lib/visa'
import { getTursoClient } from '../utils/turso'
import { verifyToken } from '../utils/auth'
import { apiError } from '../utils/api-error'
import { publishRealtime } from '../utils/realtime-publisher'

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

    console.log(`[Check Status] Checking visa.go.kr for passport: ${passport}, type: ${visaType}, appNo: ${applicationNo}`)
    const direct = await checkStudentVisaStatus(passport, fullName, birthDate, visaType, applicationNo)

    const previousRejectionReason = direct.previousRejectionReason || ''

    // Map to the same shape the frontend already expects
    const parsed = {
      status: direct.latestStatus,
      detail: direct.latestStatusKorean || direct.latestStatus,
      applicationDate: direct.latestDate || '',
      rejectionReason: direct.rejectionReason || '',
      pdfUrl: direct.pdfUrl || '',
      rawHtml: '',
      previousRejectionReason,
      entryDate: direct.entryDate || '',
      entryPurpose: direct.entryPurpose || '',
      visaExpiry: direct.visaExpiry || '',
      visaKind: direct.visaKind || '',
      statusOfResidence: direct.statusOfResidence || '',
      invitingCompany: direct.invitingCompany || '',
      resultCount: 0,
      source: 'visa.go.kr'
    }

    // Only update the DB row when we can verify which user owns this student.
    // The cabinet frontend always sends a JWT; bot flows handle their own
    // DB updates elsewhere, so we skip them here. Best-effort — never fails
    // the HTTP response.
    const authUser = await verifyToken(event)
    try {
      const db = await getTursoClient()
      const lastChecked = new Date().toISOString()
      const apiResponseStr = JSON.stringify({
        status: parsed.status,
        detail: parsed.detail,
        visaExpiry: parsed.visaExpiry || '',
        visaKind: parsed.visaKind || '',
        statusOfResidence: parsed.statusOfResidence || '',
        entryDate: parsed.entryDate || '',
        entryPurpose: parsed.entryPurpose || '',
        invitingCompany: parsed.invitingCompany || ''
      })
      const sql = (authUser && authUser.userId)
        ? `UPDATE students
           SET status = ?,
               applicationDate = ?,
               rejectReason = ?,
               pdfUrl = ?,
               apiResponse = ?,
               lastChecked = ?
           WHERE passport = ? AND userId = ?`
        : `UPDATE students
           SET status = ?,
               applicationDate = ?,
               rejectReason = ?,
               pdfUrl = ?,
               apiResponse = ?,
               lastChecked = ?
           WHERE passport = ?`

      const args: (string | number)[] = [
        parsed.status || 'Pending',
        parsed.applicationDate || '',
        parsed.rejectionReason || '',
        parsed.pdfUrl || '',
        apiResponseStr,
        lastChecked,
        passport
      ]
      if (authUser && authUser.userId) {
        args.push(authUser.userId)
      }
      await db.execute({ sql, args })

      if (authUser && authUser.userId) {
        publishRealtime(authUser.userId, {
          type: 'student.updated',
          eventId: crypto.randomUUID(),
          updatedAt: lastChecked,
          originClientId: 'check-status',
          passport,
          changes: {
            status: parsed.status || 'Pending',
            applicationDate: parsed.applicationDate || '',
            rejectReason: parsed.rejectionReason || '',
            pdfUrl: parsed.pdfUrl || '',
            apiResponse: apiResponseStr,
            lastChecked
          }
        }).catch((err: unknown) => {
          console.error('[Check Status Realtime] Failed:', err instanceof Error ? err.message : String(err))
        })
      }
    } catch (dbErr: unknown) {
      console.error('[Check Status DB Update] Error updating student visa status:', dbErr instanceof Error ? dbErr.message : String(dbErr))
    }

    return parsed
  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number, message?: string }
    if (errorObj.statusCode) throw err
    console.error('[Check Status] Error:', errorObj.message || String(err))
    apiError(500, errorObj.message || String(err))
  }
})
