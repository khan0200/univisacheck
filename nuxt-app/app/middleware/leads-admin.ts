export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return
  const leadsAdmin = useLeadsAdminStore()
  leadsAdmin.hydrate()
})
