import type { Student, StudentApiResponse, VisaCheckResult } from '~/types/student'

/** Uzbek → English visa status translations, as returned by the check-status proxy. */
export const STATUS_MAP: Record<string, string> = {
  TASDIQLANGAN: 'APPROVED',
  ISHLATILGAN: 'VISA USED',
  'BEKOR QILINGAN': 'CANCELLED',
  'RAD ETILGAN': 'REJECTED',
  "KO'RIB CHIQILMOQDA": 'UNDER REVIEW',
  'QABUL QILINGAN': 'APP/RECEIVED',
  'VIZA TAYYORLANISH BOSQICHIDA': 'UNDER REVIEW'
}

export const TECHNICAL_STATUSES = ['COMPLETED', 'SUCCESS', 'QUEUED', 'DONE', 'IN_PROGRESS', 'PENDING']

export type StatusBucket = 'pending' | 'application' | 'cancelled' | 'approved'

export function bucketForStatus(statusValue: string | undefined | null): StatusBucket {
  const status = (statusValue || '').toLowerCase()
  const isApproved = status.includes('approved') || status.includes('visa used')
  const isCancelled = status.includes('cancel') || status.includes('reject')
  const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error')

  if (isApproved) return 'approved'
  if (isCancelled) return 'cancelled'
  if (isPending) return 'pending'
  return 'application'
}

export function isApplicationStatus(statusValue: string | undefined | null): boolean {
  return bucketForStatus(statusValue) === 'application'
}

export function displayStatusText(statusValue: string | undefined | null): string {
  const status = (statusValue || '').toLowerCase()
  if (status.includes('visa used')) return 'Visa Used'
  if (status.includes('approved')) return 'Approved'
  if (status.includes('cancel') || status.includes('reject')) return 'Cancelled'
  if (status === 'pending' || status === 'unknown' || status === '' || status.includes('error')) return 'Pending'
  if (status.includes('received') || status.includes('app/')) return 'Received'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

/** Status badge color, for use with UBadge's `color` prop. */
export function statusBadgeColor(statusValue: string | undefined | null): 'success' | 'error' | 'neutral' | 'warning' | 'primary' {
  const status = (statusValue || '').toLowerCase()
  if (status.includes('approved') || status.includes('visa used')) return 'success'
  if (status.includes('cancel') || status.includes('reject')) return 'error'
  if (status === 'pending' || status === 'unknown' || status === '' || status.includes('error')) return 'neutral'
  if (status.includes('received') || status.includes('app/')) return 'warning'
  return 'primary'
}

export function formatCancellationReason(reason: string | undefined | null): string {
  return String(reason || '').replace(/\s+(?=\d+\.)/g, ' ')
}

function parseApiResponse(apiResponse: Student['apiResponse']): StudentApiResponse | null {
  if (!apiResponse) return null
  if (typeof apiResponse === 'string') {
    try {
      return JSON.parse(apiResponse)
    } catch {
      return null
    }
  }
  return apiResponse
}

/**
 * Visa decision date (심사일자/진행상태 date, e.g. "허가 (2026.07.29.)") as scraped
 * from visa.go.kr — distinct from applicationDate (신청일자). Stored under
 * apiResponse.entryDate by applyVisaCheckResult.
 */
export function getStatusDate(student: Student): string {
  const data = parseApiResponse(student.apiResponse)
  return data?.entryDate || ''
}

export function getCancellationReason(student: Student): string {
  const bucket = bucketForStatus(student.status)
  if (bucket !== 'cancelled') return ''

  let reason = ''
  const data = parseApiResponse(student.apiResponse)
  if (data) {
    reason =
      data.response_data?.visa_data?.rejection_reason ||
      data.response_data?.visa_data?.reject_reason ||
      data.response_data?.visa_data?.reason ||
      data.response_data?.rejection_reason ||
      data.response_data?.reject_reason ||
      data.visa_data?.rejection_reason ||
      data.visa_data?.reject_reason ||
      data.visa_data?.reason ||
      data.rejection_reason ||
      data.reject_reason ||
      data.reason ||
      ''
  }

  if (!reason && student.rejectReason) {
    reason = student.rejectReason
  }

  return String(reason || '').trim()
}

/**
 * Normalizes a raw check-status API response into { status, applicationDate },
 * translating Uzbek statuses and filtering out technical/error noise so only
 * genuine visa statuses reach the UI.
 */
export function extractVisaStatus(data: any): { status: string, applicationDate: string } {
  let foundStatus: string | null = null
  let applicationDate = ''

  const errorIndicators = [data.error, data.response_data?.error, data.response_data?.message, data.message]
  for (const errorMsg of errorIndicators) {
    if (errorMsg && typeof errorMsg === 'string') {
      const lowerMsg = errorMsg.toLowerCase()
      if (
        lowerMsg.includes('not found') ||
        lowerMsg.includes('no data') ||
        lowerMsg.includes('topilmadi') ||
        lowerMsg.includes('mavjud emas') ||
        lowerMsg.includes('no application') ||
        lowerMsg.includes('no record')
      ) {
        return { status: 'Pending', applicationDate: '' }
      }
    }
  }

  if (
    data.response_data === null ||
    (data.response_data && Object.keys(data.response_data).length === 0) ||
    (data.response_data && data.response_data.visa_data === null)
  ) {
    return { status: 'Pending', applicationDate: '' }
  }

  if (data.response_data?.visa_data) {
    foundStatus = data.response_data.visa_data.status
    applicationDate = data.response_data.visa_data.application_date || ''
  } else if (data.visa_data?.status) {
    foundStatus = data.visa_data.status
    applicationDate = data.visa_data.application_date || ''
  } else if (data.response_data?.visa_status) {
    foundStatus = data.response_data.visa_status
  } else if (data.response_data?.status) {
    const status = data.response_data.status
    if (!TECHNICAL_STATUSES.includes(String(status).toUpperCase())) {
      foundStatus = status
    }
  } else if (data.status) {
    const status = data.status
    const upperStatus = String(status).toUpperCase()
    if (!TECHNICAL_STATUSES.includes(upperStatus) && upperStatus !== 'ERROR' && upperStatus !== 'FAILED' && upperStatus !== 'FAILURE') {
      foundStatus = status
    }
  }

  if (!foundStatus) {
    return { status: 'Unknown', applicationDate: '' }
  }

  const normalizedStatus = String(foundStatus).toUpperCase()
  for (const [uzbek, english] of Object.entries(STATUS_MAP)) {
    if (normalizedStatus.includes(uzbek.toUpperCase())) {
      return { status: english, applicationDate }
    }
  }

  return { status: foundStatus, applicationDate }
}

export function normalizeStatusForComparison(status: string | undefined | null): string {
  const str = String(status || '').trim().toLowerCase()
  if (!str || str === 'pending' || str === 'unknown' || str.includes('error')) return 'pending'
  if (str.includes('approved') || str.includes('visa used') || str.includes('issued')) return 'approved'
  if (str.includes('cancel') || str.includes('reject')) return 'cancelled'
  if (str.includes('received') || str.includes('app/')) return 'received'
  if (str.includes('under review')) return 'under review'
  return str
}

export interface CheckVisaStatusResult {
  student: Student
  changed: boolean
  oldStatus: string
  newStatus: string
}

/**
 * Applies a VisaCheckResult onto a student record in place, returning
 * whether the status actually changed (drives the notify-Telegram call).
 */
export function applyVisaCheckResult(student: Student, result: VisaCheckResult): CheckVisaStatusResult {
  const oldStatus = student.status || 'Unknown'
  const newStatus = result.status || 'Unknown'
  const changed = normalizeStatusForComparison(oldStatus) !== normalizeStatusForComparison(newStatus)

  student.status = newStatus
  student.lastChecked = new Date().toISOString()
  student.applicationDate = result.applicationDate || ''
  student.pdfUrl = result.pdfUrl || ''
  student.rejectReason = result.rejectionReason || ''
  student.apiResponse = {
    status: newStatus,
    detail: result.detail || '',
    entryDate: result.entryDate || '',
    invitingCompany: result.invitingCompany || '',
    visaExpiry: result.visaExpiry || '',
    visaKind: result.visaKind || '',
    statusOfResidence: result.statusOfResidence || '',
    entryPurpose: result.entryPurpose || '',
    previousRejectionReason: result.previousRejectionReason || ''
  }

  return { student, changed, oldStatus, newStatus }
}
