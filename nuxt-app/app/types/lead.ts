export type LeadStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CONTACTED' | 'ENROLLED' | 'CANCELLED'
export type YesNo = 'yes' | 'no' | 'deceased' | 'not_sure' | ''

export interface Lead {
  id: string | number
  phone: string
  full_name?: string
  age?: string
  university_name?: string
  university_type?: '1_percent' | 'standard' | 'not_sure' | string
  parent_income_info?: string
  language_certificate?: string
  planned_language_certificate?: string
  father_official_income?: YesNo
  father_monthly_salary?: string
  father_house?: YesNo
  father_vehicle?: string
  mother_official_income?: YesNo
  mother_monthly_salary?: string
  mother_house?: YesNo
  mother_vehicle?: string
  business_info?: string
  self_employed_status?: YesNo
  grandparents_pension?: YesNo
  temp_bank_deposit_availability?: YesNo
  sponsor_availability?: YesNo
  parent_deceased_status?: string
  estimated_visa_approval_percentage?: string
  ai_generated_comment?: string
  status: LeadStatus
  created_at: string
  updated_at?: string
}
