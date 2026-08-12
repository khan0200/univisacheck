/**
 * server/utils/processing-notifier.ts
 *
 * "Viza berishni boshladi" notifications have been disabled/removed.
 */

import type { Client } from '@libsql/client'

export async function tryCreateProcessingNotification(
  _db: Client,
  _rawApplicationDate: string,
  _rawVisaType: string,
  _triggeredByUserId: number,
  _triggeredByPassport: string
): Promise<void> {
  // Disabled / No-op
  return Promise.resolve()
}

