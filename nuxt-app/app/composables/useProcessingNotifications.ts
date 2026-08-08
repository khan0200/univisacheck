/**
 * app/composables/useProcessingNotifications.ts
 *
 * Singleton composable managing the active "Viza berishni boshladi" cabinet toolbar banner.
 *
 * Behavior:
 * - Maintains active notification state for the cabinet toolbar.
 * - Single-line announcement: "Elchixona 20-iyul kuni hujjat topshirganlarga viza berishni boshladi."
 * - If an update arrives for the same date (e.g. new visa type added), the data updates
 *   in place and the 3-second timer resets.
 * - Auto-dismisses after 3 seconds of inactivity.
 * - Manual dismiss via dismiss().
 */

export interface ActiveProcessingNotification {
  id: string
  notificationId: number
  applicationDate: string
  visaTypes: string[]
  message: string
  createdAt: string
  countdown: number
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

    // Set or update active notification state & reset 3s timer
    activeNotification.value = {
      id,
      notificationId,
      applicationDate,
      visaTypes,
      message,
      createdAt,
      countdown: 3
    }

    startTimer()
  }

  function dismiss() {
    activeNotification.value = null
    clearTimer()
  }

  return { activeNotification, add, dismiss }
}
