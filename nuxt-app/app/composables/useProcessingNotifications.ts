/**
 * app/composables/useProcessingNotifications.ts
 *
 * Manages active "Viza berishni boshladi" notification state.
 * Single-line announcement: "Elchixona 13-iyul kuni hujjat topshirganlarga viza berishni boshladi."
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
let timerId: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

function startTimer() {
  clearTimer()
  timerId = setInterval(() => {
    if (!activeNotification.value) {
      clearTimer()
      return
    }
    if (activeNotification.value.countdown <= 1) {
      activeNotification.value = null
      clearTimer()
    } else {
      activeNotification.value.countdown -= 1
    }
  }, 1000)
}

export function useProcessingNotifications() {
  function add(ev: Record<string, unknown>) {
    if (!ev || ev.type !== 'visa_processing_started') return

    const notificationId = Number(ev.notificationId || 0)
    const applicationDate = String(ev.applicationDate || '')
    const visaTypes = Array.isArray(ev.visaTypes) ? (ev.visaTypes as string[]) : []
    const message = String(ev.message || '')
    const createdAt = String(ev.createdAt || new Date().toISOString())
    const id = `vpn-${notificationId}`

    clearTimer()
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

    if (immediate || activeNotification.value.isDismissing) {
      activeNotification.value = null
      clearTimer()
      return
    }

    activeNotification.value = {
      ...activeNotification.value,
      isDismissing: true,
      countdown: 3
    }
    startTimer()
  }

  return { activeNotification, add, dismiss }
}
