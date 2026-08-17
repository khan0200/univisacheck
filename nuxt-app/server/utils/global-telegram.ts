/**
 * server/utils/global-telegram.ts
 *
 * Global "Viza berishni boshladi" Telegram broadcast manager.
 * Disabled per user requirements.
 */

export interface GlobalTelegramPayload {
  notificationId: number
  applicationDate: string
  visaTypes: string[]
  message: string
}

export async function sendGlobalTelegramBroadcast(_payload: GlobalTelegramPayload): Promise<void> {
  // Disabled: Do not send "Viza berish boshlandi!" global Telegram broadcasts.
}
