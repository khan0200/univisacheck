/**
 * Bearer-token fetch wrapper mirroring the legacy app's authFetch(): injects
 * Authorization when a token is present, and on 401 clears the session and
 * redirects to /auth (session expiry is only detectable this way since the
 * backend issues stateless JWTs with no refresh endpoint).
 *
 * A 401 only means "your session expired" when a token was actually sent —
 * login/signup themselves return 401 for wrong credentials with no token
 * attached, which must surface as an inline form error, not a session-expiry
 * redirect loop back to the same page.
 */
export function useApiFetch() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()

  async function apiFetch<T>(path: string, options: Record<string, any> = {}): Promise<T> {
    const headers = new Headers(options.headers as HeadersInit)
    const hadToken = Boolean(authStore.token)
    if (hadToken) {
      headers.set('Authorization', `Bearer ${authStore.token}`)
    }

    try {
      return await $fetch<T>(`${config.public.apiBase}${path}`, {
        ...options,
        headers
      })
    } catch (error: any) {
      if (hadToken && error?.response?.status === 401) {
        authStore.clearSession()
        await navigateTo('/auth')
      }
      throw error
    }
  }

  return { apiFetch }
}
