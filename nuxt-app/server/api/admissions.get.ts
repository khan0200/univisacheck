const SUPABASE_URL = 'https://ilzghipeqjfnunrznngn.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kU3BWKbGrbhZFVY7AbNpmg_ldE8JWDE'

export interface SupabaseAdmissionRow {
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

export default defineEventHandler(async () => {
  try {
    const data = await $fetch<SupabaseAdmissionRow[]>(`${SUPABASE_URL}/rest/v1/admissions?select=*&order=created_at.desc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    })

    return {
      success: true,
      data: data || []
    }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to fetch admissions from Supabase',
      data: []
    }
  }
})
