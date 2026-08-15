import { getTursoClient } from '../utils/turso'

export interface AdmissionRow {
  id: string
  university_name: string
  education_level: string
  admission_period: string | null
  rounds_count: string | null
  is_expected: boolean | null
  expected_date_range: { from?: string | null, to?: string | null } | null
  rounds: Array<{
    roundNumber?: number
    onlineApplicationFrom?: string
    onlineApplicationTo?: string
    documentSubmission?: string
    interview?: string
    announcement?: string
  }> | null
  visa_types: string[] | null
  university_types: string[] | null
  is_hidden: boolean | null
  created_at: string
  updated_at: string
}

// Backwards-compatibility alias
export type SupabaseAdmissionRow = AdmissionRow

function safeParseJson<T>(str: unknown, fallback: T): T {
  if (!str || typeof str !== 'string') return fallback
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

export default defineEventHandler(async () => {
  try {
    const db = await getTursoClient()
    const result = await db.execute('SELECT * FROM admissions ORDER BY created_at DESC')

    const data: AdmissionRow[] = result.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      university_name: String(r.university_name || ''),
      education_level: String(r.education_level || ''),
      admission_period: r.admission_period ? String(r.admission_period) : null,
      rounds_count: r.rounds_count ? String(r.rounds_count) : null,
      is_expected: Boolean(r.is_expected),
      expected_date_range: safeParseJson<{ from?: string | null, to?: string | null } | null>(r.expected_date_range, {}),
      rounds: safeParseJson<Array<Record<string, unknown>> | null>(r.rounds, []),
      visa_types: safeParseJson<string[] | null>(r.visa_types, []),
      university_types: safeParseJson<string[] | null>(r.university_types, []),
      is_hidden: Boolean(r.is_hidden),
      created_at: String(r.created_at || ''),
      updated_at: String(r.updated_at || '')
    }))

    return {
      success: true,
      data
    }
  } catch (error: unknown) {
    const err = error as { message?: string }
    return {
      success: false,
      error: err?.message || 'Failed to fetch admissions from database',
      data: []
    }
  }
})
