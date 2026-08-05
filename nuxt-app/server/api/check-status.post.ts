import { checkStudentVisaStatus } from '../lib/visa'
import { getTursoClient } from '../utils/turso'
import { verifyToken } from '../utils/auth'
import { apiError } from '../utils/api-error'

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

    let previousRejectionReason = direct.previousRejectionReason || ''

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

      const args: any[] = [
        parsed.status || 'Pending',
        parsed.applicationDate || '',
        parsed.rejectionReason || '',
        parsed.pdfUrl || '',
        JSON.stringify({
          status: parsed.status,
          detail: parsed.detail,
          visaExpiry: parsed.visaExpiry || '',
          visaKind: parsed.visaKind || '',
          statusOfResidence: parsed.statusOfResidence || '',
          entryDate: parsed.entryDate || '',
          entryPurpose: parsed.entryPurpose || '',
          invitingCompany: parsed.invitingCompany || ''
        }),
        lastChecked,
        passport
      ]
      if (authUser && authUser.userId) {
        args.push(authUser.userId)
      }
      await db.execute({ sql, args })
    } catch (dbErr: any) {
      console.error('[Check Status DB Update] Error updating student visa status:', dbErr.message)
    }

    return parsed
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('[Check Status] Error:', err.message)
    apiError(500, err.message)
  }
})
