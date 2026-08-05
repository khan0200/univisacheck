import type { VisaCheckApiResult, VisaType } from '~/types/visa-check'
import type { Student } from '~/types/student'
import { REAL_STATUSES } from '~/utils/visa-check-status'

const CHECK_STATUS_URL = '/api/check-status'
const STUDENTS_URL = '/api/students'
const DOWNLOAD_PDF_URL = '/api/download-visa-pdf'

export function useVisaCheckService() {
  const { apiFetch } = useApiFetch()

  function checkStatus(input: { passport: string, name: string, dob: string, visaType: VisaType, appNo: string }) {
    return apiFetch<VisaCheckApiResult>(CHECK_STATUS_URL, {
      method: 'POST',
      body: {
        passport_number: input.passport,
        english_name: input.name,
        birth_date: input.dob,
        visa_type: input.visaType,
        application_no: input.appNo
      }
    })
  }

  /** Public passport lookup — used both for live-typing autofill and as a cached fallback when a live check reports not-found. */
  function lookupPublic(passport: string) {
    return apiFetch<Student[]>(`${STUDENTS_URL}?passport=${encodeURIComponent(passport)}&public=true`)
  }

  /**
   * When the live visa.go.kr check reports not-found, fall back to the
   * consultant-entered cached record (if it has a genuine status) rather
   * than showing "no record found" — mirrors visa-status.html's inline
   * fallback in handleSearch().
   */
  async function cachedFallback(passport: string): Promise<{ result: VisaCheckApiResult, cached: true } | null> {
    try {
      const rows = await lookupPublic(passport)
      const s = rows?.[0]
      if (!s || !REAL_STATUSES.includes((s.status || '').toUpperCase())) return null

      let extra: Record<string, any> = {}
      try {
        extra = typeof s.apiResponse === 'string' ? JSON.parse(s.apiResponse || '{}') : (s.apiResponse as any) || {}
      } catch {
        extra = {}
      }

      return {
        cached: true,
        result: {
          found: true,
          status: s.status,
          applicationDate: s.applicationDate || (s.lastChecked ? s.lastChecked.slice(0, 10) : ''),
          rejectionReason: s.rejectReason || '',
          entryDate: extra.entryDate || '',
          entryPurpose: extra.entryPurpose || '',
          visaExpiry: extra.visaExpiry || '',
          visaKind: extra.visaKind || '',
          statusOfResidence: extra.statusOfResidence || '',
          invitingCompany: extra.invitingCompany || '',
          source: 'cached',
          lastChecked: s.lastChecked || ''
        }
      }
    } catch {
      return null
    }
  }

  function downloadPdfUrl(input: { passport: string, name: string, dob: string, visaType: VisaType, appNo: string }) {
    const params = new URLSearchParams({
      passport: input.passport,
      full_name: input.name,
      birth_date: input.dob,
      visa_type: input.visaType,
      application_no: input.appNo || ''
    })
    return `${DOWNLOAD_PDF_URL}?${params.toString()}`
  }

  return { checkStatus, lookupPublic, cachedFallback, downloadPdfUrl }
}
