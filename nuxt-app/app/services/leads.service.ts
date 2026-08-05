import type { Lead, LeadStatus } from '~/types/lead'

const LEADS_URL = '/api/visa-calc-leads'

export function useLeadsService() {
  const config = useRuntimeConfig()
  const leadsAdmin = useLeadsAdminStore()

  async function request<T>(options: { method?: string, body?: unknown } = {}): Promise<T> {
    try {
      return await $fetch<T>(`${config.public.apiBase}${LEADS_URL}`, {
        method: (options.method as any) || 'GET',
        body: options.body as Record<string, any> | undefined,
        headers: { Authorization: `Bearer ${leadsAdmin.secret}` }
      })
    } catch (error: any) {
      if (error?.response?.status === 401) {
        throw new Error('unauthorized')
      }
      throw new Error(error?.data?.error || `Server xatosi: ${error?.response?.status || ''}`)
    }
  }

  function fetchLeads() {
    return request<Lead[]>()
  }

  function updateStatus(id: string | number, status: LeadStatus) {
    return request({ method: 'PATCH', body: { id, status } })
  }

  function updateFields(id: string | number, fields: Record<string, string>) {
    return request({ method: 'PATCH', body: { id, fields } })
  }

  function deleteLead(id: string | number) {
    return request({ method: 'DELETE', body: { id } })
  }

  return { fetchLeads, updateStatus, updateFields, deleteLead }
}
