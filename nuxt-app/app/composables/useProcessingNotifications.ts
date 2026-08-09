/**
 * app/composables/useProcessingNotifications.ts
 *
 * Singleton composable managing the active "Viza berishni boshladi" cabinet toolbar banner.
 *
 * Behavior:
 * - Maintains active notification state for the cabinet toolbar.
 * - Single-line announcement: "Elchixona 20-iyul kuni hujjat topshirganlarga viza berishni boshladi."
 * - Stays visible until the user clicks the X button.
 * - Clicking the X button starts a 3-second countdown before auto-dismissing.
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

// Singleton state
const activeNotification = ref<ActiveProcessingNotification | null>(null)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function startTimer() {
  clearTimer()
  countdownTimer = setInterval(() => {
    if (!activeNotification.value) {
      clearTimer()
      return
    }

    if (activeNotification.value.countdown <= 1) {
      activeNotification.value = null
      clearTimer()
    } else {
      activeNotification.value = {
        ...activeNotification.value,
        countdown: activeNotification.value.countdown - 1
      }
    }
  }, 1000)
}

export function useProcessingNotifications() {
  function add(ev: {
    notificationId?: number
    applicationDate?: string
    visaTypes?: string[]
    message?: string
    createdAt?: string
  }) {
    const applicationDate = ev.applicationDate || ''
    if (!applicationDate) return

    const notificationId = ev.notificationId ?? Date.now()
    const visaTypes = ev.visaTypes || []
    const message = ev.message || `Elchixona ${applicationDate} kuni hujjat topshirganlarga viza berishni boshladi.`
    const createdAt = ev.createdAt || new Date().toISOString()
    const id = `vpn-${notificationId}`

    clearTimer()
    // Set or update active notification state & stay still until user clicks X
    activeNotification.value = {
      id,
      notificationId,
      applicationDate,
      visaTypes,
      message,
      createdAt,
      countdown: 3,
      isDismissing: false
    }
  }

  function dismiss(immediate = false) {
    if (!activeNotification.value) return

    // If already counting down or immediate flag passed, close immediately
    if (immediate || activeNotification.value.isDismissing) {
      activeNotification.value = null
      clearTimer()
      return
    }

    // Start 3-second countdown after user clicks X button
    activeNotification.value = {
      ...activeNotification.value,
      isDismissing: true,
      countdown: 3
    }
    startTimer()
  }

  return { activeNotification, add, dismiss }
}
