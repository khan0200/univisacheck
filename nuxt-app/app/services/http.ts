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
 *
 * Also attaches X-Client-Id to every mutation request so the SSE endpoint
 * can echo it back and the originating browser can skip its own event.
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

    // Attach the realtime client ID to all mutation requests so the server
    // can include it in the broadcasted event. The originating browser uses
    // this to skip its own events (already applied optimistically).
    const method = (options.method || 'GET').toUpperCase()
    if (method !== 'GET' && import.meta.client) {
      try {
        const { getRealtimeClientId } = await import('~/composables/useRealtimeSync')
        headers.set('X-Client-Id', getRealtimeClientId())
      } catch {
        // composable not yet loaded — safe to skip
      }
    }

    try {
      return await $fetch<T>(`${config.public.apiBase}${path}`, {
        ...options,
        headers
      }) as T
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
