import type { Student, StudentApiResponse, VisaCheckResult } from '~/types/student'

/** Uzbek → English visa status translations, as returned by the check-status proxy. */
export const STATUS_MAP: Record<string, string> = {
  'TASDIQLANGAN': 'APPROVED',
  'ISHLATILGAN': 'VISA USED',
  'BEKOR QILINGAN': 'CANCELLED',
  'RAD ETILGAN': 'REJECTED',
  'KO\'RIB CHIQILMOQDA': 'UNDER REVIEW',
  'QABUL QILINGAN': 'APP/RECEIVED',
  'VIZA TAYYORLANISH BOSQICHIDA': 'UNDER REVIEW'
}

export const TECHNICAL_STATUSES = ['COMPLETED', 'SUCCESS', 'QUEUED', 'DONE', 'IN_PROGRESS', 'PENDING']

export type StatusBucket = 'pending' | 'application' | 'cancelled' | 'approved'

export function bucketForStatus(statusValue: string | undefined | null): StatusBucket {
  const status = (statusValue || '').toLowerCase()
  const isApproved = status.includes('approved') || status.includes('visa used')
  const isCancelled = status.includes('cancel') || status.includes('reject')
  const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error') || status.includes('not found') || status.includes('no application') || status.includes('topilmadi') || status.includes('mavjud emas')

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
  if (isSupplementSubmittedStatus(status)) return 'Supplement Submitted'
  if (isSupplementNeededStatus(status) || isSupplementStatus(status)) return 'Supplement Needed'
  if (status === 'pending' || status === 'unknown' || status === '' || status.includes('error')) return 'Pending'
  if (status.includes('received') || status.includes('app/')) return 'Received'
  if (status.includes('under review') || status.includes('심사중') || status.includes('심사 중') || status.includes('처리중') || status.includes('처리 중')) return 'Under Review'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

/** Status badge color, for use with UBadge's `color` prop. */
export function statusBadgeColor(statusValue: string | undefined | null): 'success' | 'error' | 'neutral' | 'warning' | 'primary' {
  const status = (statusValue || '').toLowerCase()
  if (status.includes('approved') || status.includes('visa used')) return 'success'
  if (status.includes('cancel') || status.includes('reject')) return 'error'
  if (isSupplementSubmittedStatus(status)) return 'primary'
  if (isSupplementNeededStatus(status) || isSupplementStatus(status)) return 'warning'
  if (status === 'pending' || status === 'unknown' || status === '' || status.includes('error')) return 'neutral'
  if (status.includes('received') || status.includes('app/')) return 'warning'
  return 'primary'
}

export function formatCancellationReason(reason: string | undefined | null): string {
  return String(reason || '').replace(/\s+(?=\d+\.)/g, ' ')
}

export interface RejectionReasonItem {
  number?: string
  text: string
}

export function parseRejectionReason(reason: string | undefined | null): RejectionReasonItem[] {
  if (!reason) return []
  let str = String(reason).trim()
  if (!str) return []

  // Remove leading "Rejected:" prefix if present
  str = str.replace(/^Rejected:\s*/i, '').trim()

  // Match pattern: (digit+).(text until next digit+. or end of string)
  const regex = /(\d+)\.\s*([\s\S]+?)(?=(?:\s*\d+\.|$))/g
  const matches = Array.from(str.matchAll(regex))

  if (matches.length > 0) {
    const items: RejectionReasonItem[] = []
    const firstMatch = matches[0]
    const firstMatchIdx = firstMatch?.index ?? 0
    if (firstMatchIdx > 0) {
      const preText = str.slice(0, firstMatchIdx).trim()
      if (preText) {
        items.push({ text: preText })
      }
    }
    for (const match of matches) {
      const num = match[1]
      const txt = (match[2] ?? '').trim()
      if (txt) {
        items.push({ number: num, text: txt })
      }
    }
    return items
  }

  return [{ text: str }]
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
  if (!data) return ''
  const rec = data as Record<string, unknown>
  const vData = data.response_data?.visa_data as Record<string, unknown> | undefined
  const vData2 = data.visa_data as Record<string, unknown> | undefined
  return String(
    data.entryDate
    || rec.entry_date
    || rec.givenDate
    || rec.statusDate
    || vData?.entry_date
    || vData?.entryDate
    || vData2?.entry_date
    || vData2?.entryDate
    || ''
  )
}

export function getCancellationReason(student: Student): string {
  const bucket = bucketForStatus(student.status)
  const isSupplement = (student.status || '').toLowerCase().includes('supplement')
  if (bucket !== 'cancelled' && !isSupplement) return ''

  let reason = ''
  const data = parseApiResponse(student.apiResponse)
  if (data) {
    const vData = data.response_data?.visa_data
    const rData = data.response_data
    const visaD = data.visa_data
    reason = vData?.rejection_reason
      || vData?.reject_reason
      || vData?.reason
      || rData?.rejection_reason
      || rData?.reject_reason
      || visaD?.rejection_reason
      || visaD?.reject_reason
      || visaD?.reason
      || data.rejection_reason
      || data.reject_reason
      || data.reason
      || ''
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
export function extractVisaStatus(data: Record<string, unknown>): { status: string, applicationDate: string } {
  let foundStatus: string | null = null
  let applicationDate = ''

  const resData = data.response_data as Record<string, unknown> | null | undefined
  const visaData = data.visa_data as Record<string, unknown> | null | undefined

  const errorIndicators = [data.error, resData?.error, resData?.message, data.message]
  for (const errorMsg of errorIndicators) {
    if (errorMsg && typeof errorMsg === 'string') {
      const lowerMsg = errorMsg.toLowerCase()
      if (
        lowerMsg.includes('not found')
        || lowerMsg.includes('no data')
        || lowerMsg.includes('topilmadi')
        || lowerMsg.includes('mavjud emas')
        || lowerMsg.includes('no application')
        || lowerMsg.includes('no record')
      ) {
        return { status: 'Pending', applicationDate: '' }
      }
    }
  }

  if (
    data.response_data === null
    || (resData && Object.keys(resData).length === 0)
    || (resData && resData.visa_data === null)
  ) {
    return { status: 'Pending', applicationDate: '' }
  }

  const innerVisaData = resData?.visa_data as Record<string, unknown> | null | undefined

  if (innerVisaData) {
    foundStatus = (innerVisaData.status as string) || null
    applicationDate = (innerVisaData.application_date as string) || ''
  } else if (visaData?.status) {
    foundStatus = (visaData.status as string) || null
    applicationDate = (visaData.application_date as string) || ''
  } else if (resData?.visa_status) {
    foundStatus = (resData.visa_status as string) || null
  } else if (resData?.status) {
    const status = String(resData.status)
    if (!TECHNICAL_STATUSES.includes(status.toUpperCase())) {
      foundStatus = status
    }
  } else if (data.status) {
    const status = String(data.status)
    const upperStatus = status.toUpperCase()
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
  if (isSupplementSubmittedStatus(str)) return 'supplement submitted'
  if (isSupplementNeededStatus(str) || isSupplementStatus(str)) return 'supplement needed'
  if (str.includes('received') || str.includes('app/')) return 'received'
  if (isUnderReviewStatus(str)) return 'under review'
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

/** Calculate calendar days elapsed since applicationDate (YYYY-MM-DD). */
export function getDaysSinceApplication(appDateStr: string | undefined | null): number {
  if (!appDateStr) return 0
  const str = String(appDateStr).trim()
  const match = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (match && match[1] && match[2] && match[3]) {
    const year = parseInt(match[1], 10)
    const month = parseInt(match[2], 10) - 1
    const day = parseInt(match[3], 10)

    const appDate = new Date(year, month, day)
    const today = new Date()
    appDate.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)

    const diffMs = today.getTime() - appDate.getTime()
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  const parsed = new Date(str)
  if (isNaN(parsed.getTime())) return 0
  const today = new Date()
  parsed.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24))
}

export function isUnderReviewStatus(statusValue: string | undefined | null): boolean {
  const s = (statusValue || '').toLowerCase()
  return s.includes('under review')
    || s.includes('심사중')
    || s.includes('심사 중')
    || s.includes('처리중')
    || s.includes('처리 중')
    || s.includes('ko\'rib chiqilmoqda')
    || s.includes('viza tayyorlanish bosqichida')
}

export function isSupplementSubmittedStatus(statusValue: string | undefined | null): boolean {
  const s = (statusValue || '').toLowerCase()
  return s.includes('supplement submitted')
    || s.includes('supplement completed')
    || s.includes('보완완료')
    || s.includes('보완제출')
    || s.includes('보완접수')
}

export function isSupplementNeededStatus(statusValue: string | undefined | null): boolean {
  const s = (statusValue || '').toLowerCase()
  return s.includes('supplement needed')
    || s.includes('supplement requested')
    || s.includes('pending supplement')
    || s.includes('보완요청')
    || s.includes('보완요구')
    || s.includes('보완대기')
}

export function isSupplementStatus(statusValue: string | undefined | null): boolean {
  const s = (statusValue || '').toLowerCase()
  return s.includes('supplement')
    || s.includes('asking')
    || s.includes('보완')
    || s.includes('qo\'shimcha')
}

/**
 * Determines whether a selected student in the Application tab is eligible for bulk checking:
 * 1. Under Review — highest priority (always check, regardless of applied date).
 * 2. Supplement Needed — highest priority (always check, regardless of applied date).
 * 3. Applied date >= 10 days ago — check.
 * 4. Applied date < 10 days ago — do not check.
 */
export function isEligibleForApplicationCheck(student: { status?: string | null, applicationDate?: string | null }): boolean {
  if (isUnderReviewStatus(student.status)) {
    return true
  }

  if (isSupplementStatus(student.status)) {
    return true
  }

  const days = getDaysSinceApplication(student.applicationDate)
  if (days >= 10) {
    return true
  }

  return false
}
