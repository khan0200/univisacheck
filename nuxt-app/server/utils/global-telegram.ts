/**
 * server/utils/global-telegram.ts
 *
 * Global "Viza berishni boshladi" notifications have been removed.
 */

export interface GlobalTelegramPayload {
  notificationId: number
  applicationDate: string
  visaTypes: string[]
  message: string
}

export async function sendGlobalTelegramBroadcast(_payload: GlobalTelegramPayload): Promise<void> {
  // Disabled / No-op
  return Promise.resolve()
}

