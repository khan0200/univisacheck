const SUPABASE_URL = 'https://ilzghipeqjfnunrznngn.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kU3BWKbGrbhZFVY7AbNpmg_ldE8JWDE'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { action, id, payload } = body

  const headers: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }

  try {
    if (action === 'create') {
      const now = new Date().toISOString()
      const data = await $fetch(`${SUPABASE_URL}/rest/v1/admissions`, {
        method: 'POST',
        headers,
        body: {
          ...payload,
          is_hidden: false,
          created_at: now,
          updated_at: now
        }
      })
      return { success: true, data }
    }

    if (action === 'update' && id) {
      const now = new Date().toISOString()
      const data = await $fetch(`${SUPABASE_URL}/rest/v1/admissions?id=eq.${id}`, {
        method: 'PATCH',
        headers,
        body: {
          ...payload,
          updated_at: now
        }
      })
      return { success: true, data }
    }

    if (action === 'toggle_hide' && id) {
      const now = new Date().toISOString()
      const data = await $fetch(`${SUPABASE_URL}/rest/v1/admissions?id=eq.${id}`, {
        method: 'PATCH',
        headers,
        body: {
          is_hidden: payload.is_hidden,
          updated_at: now
        }
      })
      return { success: true, data }
    }

    if (action === 'delete' && id) {
      await $fetch(`${SUPABASE_URL}/rest/v1/admissions?id=eq.${id}`, {
        method: 'DELETE',
        headers
      })
      return { success: true }
    }

    return { success: false, error: 'Invalid action or missing ID' }
  } catch (err: unknown) {
    const errorObj = err as { data?: { message?: string }, message?: string }
    console.error('Supabase Manage Error:', err)
    return {
      success: false,
      error: errorObj?.data?.message || errorObj?.message || 'Database operation failed'
    }
  }
})
