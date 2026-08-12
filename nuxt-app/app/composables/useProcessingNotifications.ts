/**
 * app/composables/useProcessingNotifications.ts
 *
 * "Viza berishni boshladi" notifications disabled.
 */

export interface ActiveProcessingNotification {
  id: string
  notificationId: number
  applicationDate: string
  visaTypes: string[]
  message: string
  createdAt: string
  countdown: number
  isDismissing?: boolean
}

const activeNotification = ref<ActiveProcessingNotification | null>(null)

export function useProcessingNotifications() {
  function add(_ev: Record<string, unknown>) {
    // Disabled / No-op
  }

  function dismiss(_immediate = false) {
    // Disabled / No-op
  }

  return { activeNotification, add, dismiss }
}

