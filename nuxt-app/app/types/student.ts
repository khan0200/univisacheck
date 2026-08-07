export type VisaType = 'Embassy' | 'E-Visa' | 'Regional'
export type VisaTypeFilter = 'all' | 'Embassy' | 'E-Visa' | 'Regional'

export type StatusFilter = 'pending' | 'application' | 'cancelled' | 'approved'

export interface StudentApiResponse {
  status?: string
  detail?: string
  entryDate?: string
  invitingCompany?: string
  visaExpiry?: string
  visaKind?: string
  statusOfResidence?: string
  entryPurpose?: string
  previousRejectionReason?: string
  response_data?: {
    visa_data?: {
      rejection_reason?: string
      reject_reason?: string
      reason?: string
    }
    rejection_reason?: string
    reject_reason?: string
  }
  visa_data?: {
    rejection_reason?: string
    reject_reason?: string
    reason?: string
  }
  rejection_reason?: string
  reject_reason?: string
  reason?: string
}

export interface Student {
  passport: string
  fullName: string
  birthday: string
  studentId?: string
  status: string
  applicationDate?: string
  lastChecked?: string
  rejectReason?: string
  pdfUrl?: string
  apiResponse?: StudentApiResponse | string
  batchSelected?: boolean
  batchSelectedUpdatedAt?: string
  createdAt?: string
  userId?: string | number
  visaType: VisaType
  applicationNo?: string
  deletedAt?: string | null
}

export interface StudentFormInput {
  fullName: string
  passport: string
  birthday: string
  studentId: string
  visaType: VisaType
  applicationNo: string
  originalPassport?: string
}

export interface VisaCheckResult {
  status: string
  detail?: string
  applicationDate?: string
  rejectionReason?: string
  rawHtml?: string
  pdfUrl?: string
  previousRejectionReason?: string
  invitingCompany?: string
  entryDate?: string
  visaExpiry?: string
  visaKind?: string
  statusOfResidence?: string
  entryPurpose?: string
}
