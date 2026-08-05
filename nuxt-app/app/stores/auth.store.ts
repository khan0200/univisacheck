import { defineStore } from 'pinia'
import type { AuthUser } from '~/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>('')
  const user = ref<AuthUser | null>(null)
  const isHydrated = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value))

  function hydrate() {
    if (isHydrated.value || import.meta.server) return
    token.value = localStorage.getItem('authToken') || ''
    const rawUser = localStorage.getItem('authUser')
    user.value = rawUser ? JSON.parse(rawUser) : null
    isHydrated.value = true
  }

  function setSession(newToken: string, newUser: AuthUser) {
    token.value = newToken
    user.value = newUser
    if (import.meta.client) {
      localStorage.setItem('authToken', newToken)
      localStorage.setItem('authUser', JSON.stringify(newUser))
    }
  }

  function updateUser(newUser: AuthUser) {
    user.value = newUser
    if (import.meta.client) {
      localStorage.setItem('authUser', JSON.stringify(newUser))
    }
  }

  function clearSession() {
    token.value = ''
    user.value = null
    if (import.meta.client) {
      localStorage.removeItem('authToken')
      localStorage.removeItem('authUser')
    }
  }

  return { token, user, isHydrated, isAuthenticated, hydrate, setSession, updateUser, clearSession }
})
