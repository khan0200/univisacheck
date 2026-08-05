import type { Lead } from '~/types/lead'

export const YES_NO_LABEL: Record<string, string> = {
  yes: 'Ha',
  no: "Yo'q",
  deceased: 'Vafot etgan',
  not_sure: 'Bilmayman'
}

export function yn(value: string | undefined): string | null {
  if (!value) return null
  return YES_NO_LABEL[value] || value
}

export function formatLeadDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(`${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}`
}

export interface FinancialStatus {
  cls: 'strong' | 'medium' | 'weak' | 'unknown'
  label: string
}

/** Quick-glance triage badge — not a replacement for the AI's own estimate, just a scan-friendly signal computed from what's on hand. */
export function financialStatus(l: Lead): FinancialStatus {
  const fatherOk = l.father_official_income === 'yes'
  const motherOk = l.mother_official_income === 'yes'
  const hasAsset = l.father_house === 'yes' || l.father_vehicle === 'yes' || l.mother_house === 'yes' || l.mother_vehicle === 'yes'
  if (fatherOk && motherOk && hasAsset) return { cls: 'strong', label: 'Kuchli' }
  if (fatherOk || motherOk) return { cls: 'medium', label: "O'rtacha" }
  if (l.father_official_income || l.mother_official_income) return { cls: 'weak', label: 'Zaif' }
  return { cls: 'unknown', label: "Noma'lum" }
}

export const LEAD_STATUS_OPTIONS: { value: Lead['status'], label: string }[] = [
  { value: 'NEW', label: 'Yangi' },
  { value: 'IN_PROGRESS', label: 'Jarayonda' },
  { value: 'COMPLETED', label: 'Tugallangan' },
  { value: 'CONTACTED', label: "Bog'lanilgan" },
  { value: 'ENROLLED', label: "Ro'yxatga olingan" },
  { value: 'CANCELLED', label: 'Bekor qilingan' }
]

const CSV_COLUMNS: [keyof Lead, string][] = [
  ['full_name', 'Full Name'],
  ['phone', 'Phone Number'],
  ['age', 'Age'],
  ['language_certificate', 'Language Certificate'],
  ['planned_language_certificate', 'Planned Certificate'],
  ['university_name', 'University'],
  ['university_type', 'University Type'],
  ['father_official_income', 'Father Official Income'],
  ['father_monthly_salary', 'Father Monthly Salary'],
  ['father_house', 'Father House'],
  ['father_vehicle', 'Father Vehicle'],
  ['mother_official_income', 'Mother Official Income'],
  ['mother_monthly_salary', 'Mother Monthly Salary'],
  ['mother_house', 'Mother House'],
  ['mother_vehicle', 'Mother Vehicle'],
  ['business_info', 'Business Info'],
  ['self_employed_status', 'Self Employed'],
  ['grandparents_pension', 'Grandparents Pension'],
  ['temp_bank_deposit_availability', 'Temp Bank Deposit'],
  ['sponsor_availability', 'Sponsor Availability'],
  ['parent_deceased_status', 'Parent Deceased'],
  ['estimated_visa_approval_percentage', 'Visa Approval'],
  ['ai_generated_comment', 'AI Comment'],
  ['status', 'Status'],
  ['created_at', 'Created At'],
  ['updated_at', 'Updated At']
]

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportLeadsCsv(rows: Lead[]): void {
  const lines = [CSV_COLUMNS.map((c) => c[1]).join(',')]
  for (const lead of rows) {
    lines.push(CSV_COLUMNS.map(([key]) => escapeCsv(lead[key])).join(','))
  }

  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `visa-calc-leads-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
