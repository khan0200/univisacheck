import type { VisaType } from './student'

export interface VisaCheckFormInput {
  passport: string
  name: string
  dob: string
  appNo: string
}

export interface VisaCheckApiResult {
  found: boolean
  status?: string
  applicationDate?: string
  rejectionReason?: string
  entryDate?: string
  entryPurpose?: string
  visaExpiry?: string
  visaKind?: string
  statusOfResidence?: string
  invitingCompany?: string
  pdfUrl?: string
  source?: 'cached'
  lastChecked?: string
}

export interface StatusConfig {
  cls: 'approved' | 'used' | 'review' | 'received' | 'rejected' | 'cancelled' | 'pending'
  icon: 'check' | 'search' | 'clock' | 'inbox' | 'x' | 'pass'
  label: string
}

export type { VisaType }
