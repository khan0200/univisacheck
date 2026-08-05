import { downloadStudentVisaPdf } from '../lib/visa'
import { apiError } from '../utils/api-error'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const pdfUrlParam = String(query.url || '').trim()
    const passportParam = String(query.passport || '').trim().toUpperCase()
    const fullNameParam = String(query.full_name || '').trim().toUpperCase()
    const birthParam = String(query.birth_date || '').trim()
    const visaTypeParam = String(query.visa_type || query.visaType || 'Embassy').trim()
    const applicationNoParam = String(query.application_no || query.applicationNo || '').trim()

    if (!passportParam || !fullNameParam || !birthParam) {
      apiError(400, 'Missing required parameters (passport, full_name, birth_date).')
    }

    // Only visa.go.kr URLs are supported (visamasters.uz fallback dropped —
    // no caller anywhere in the app ever exercised it).
    if (pdfUrlParam) {
      let parsedTarget: URL
      try {
        parsedTarget = new URL(pdfUrlParam)
      } catch {
        apiError(400, 'Invalid PDF URL')
      }
      if (!parsedTarget!.hostname.endsWith('visa.go.kr')) {
        apiError(403, 'Forbidden: URL must be from visa.go.kr')
      }
    }

    const { filename, buffer } = await downloadStudentVisaPdf(
      passportParam,
      fullNameParam,
      birthParam,
      visaTypeParam,
      applicationNoParam,
      pdfUrlParam
    )

    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    return buffer
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('[Download Visa PDF] Error:', err.message)
    // downloadStudentVisaPdf() throws plain Errors with these exact messages
    // for the two known failure modes — map back to the legacy status codes.
    if (err.message?.includes('No visa record') || err.message?.includes('did not return a PDF file')) {
      apiError(404, err.message)
    }
    if (err.message?.includes('print service returned HTTP')) {
      apiError(502, err.message)
    }
    apiError(500, err.message)
  }
})
