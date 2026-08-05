export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const authStore = useAuthStore()
  authStore.hydrate()

  if (!authStore.token) return

  const { me } = useAuthService()
  try {
    await me()
    return navigateTo('/cabinet')
  } catch {
    authStore.clearSession()
  }
})
