import { defineStore } from 'pinia'

/** Admin-secret bearer token for the leads dashboard — separate from the JWT auth store since this gates api/visa-calc-leads via ADMIN_SECRET, not a user session. */
export const useLeadsAdminStore = defineStore('leads-admin', () => {
  const secret = ref('')
  const isHydrated = ref(false)

  function hydrate() {
    if (isHydrated.value || import.meta.server) return
    secret.value = sessionStorage.getItem('leadsAdminSecret') || ''
    isHydrated.value = true
  }

  function setSecret(value: string) {
    secret.value = value
    if (import.meta.client) sessionStorage.setItem('leadsAdminSecret', value)
  }

  function clearSecret() {
    secret.value = ''
    if (import.meta.client) sessionStorage.removeItem('leadsAdminSecret')
  }

  return { secret, isHydrated, hydrate, setSecret, clearSecret }
})
