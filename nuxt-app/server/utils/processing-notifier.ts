/**
 * server/utils/processing-notifier.ts
 *
 * Atomic "Viza berishni boshladi" notification manager.
 *
 * Enforces ONE APPLICATION DATE = ONE NOTIFICATION = ONE TELEGRAM MESSAGE PER RECIPIENT.
 *
 * - If notification for date does not exist: creates record, sends initial web + Telegram broadcast.
 * - If notification for date exists and new visaType is found: updates visaTypes array in DB,
 *   broadcasts updated realtime event to web, and EDITS existing Telegram messages via editMessageText.
 * - If notification exists and visaType is already recorded: does nothing.
 */

import type { Client } from '@libsql/client'
import { publishToAllUsers } from './realtime-publisher'

/** Normalize applicationDate to YYYY-MM-DD. Returns '' on failure. */
function normalizeDate(raw: string): string {
  if (!raw) return ''
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return match && match[1] ? match[1] : ''
}

/** Format applicationDate for display (e.g. 2026-07-20 -> 20-iyul). */
function formatDateUz(isoDate: string): string {
  const months: Record<string, string> = {
    '01': 'yanvar', '02': 'fevral', '03': 'mart', '04': 'aprel',
    '05': 'may', '06': 'iyun', '07': 'iyul', '08': 'avgust',
    '09': 'sentabr', '10': 'oktabr', '11': 'noyabr', '12': 'dekabr'
  }
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  const monthName = months[month] || month
  return `${parseInt(day, 10)}-${monthName}`
}

/** Build the clean single-line announcement message. */
function buildMessage(applicationDate: string): string {
  const dateStr = formatDateUz(applicationDate)
  return `Elchixona ${dateStr} kuni hujjat topshirganlarga viza berishni boshladi.`
}

/**
 * Attempts to create or update a global "visa_processing_started" notification
 * for the given applicationDate and visaType.
 *
 * Safe for concurrent callers across multiple Vercel instances.
 */
export async function tryCreateProcessingNotification(
  db: Client,
  rawApplicationDate: string,
  rawVisaType: string,
  triggeredByUserId: number,
  triggeredByPassport: string
): Promise<void> {
  const applicationDate = normalizeDate(rawApplicationDate)
  if (!applicationDate) {
    console.log('[ProcessingNotifier] Skipped: empty applicationDate')
    return
  }

  const visaType = (rawVisaType || 'Noma\'lum').trim()
  const message = buildMessage(applicationDate)

  // 1. Check if a notification already exists for this application_date
  const existingRes = await db.execute({
    sql: `SELECT id, visa_types, created_at FROM visa_processing_notifications
          WHERE type = 'visa_processing_started' AND application_date = ?`,
    args: [applicationDate]
  })

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0] as Record<string, unknown>
    const notificationId = Number(existing.id)
    const createdAt = String(existing.created_at || new Date().toISOString())

    let currentVisaTypes: string[]
    try {
      currentVisaTypes = JSON.parse(String(existing.visa_types || '[]'))
    } catch {
      currentVisaTypes = []
    }

    if (currentVisaTypes.includes(visaType)) {
      // Visa type already recorded for this date — nothing to update or send
      console.log(`[ProcessingNotifier] Notification #${notificationId} for ${applicationDate} already contains ${visaType} — suppressed.`)
      return
    }

    // New visa type detected for existing date — update visa_types array!
    const updatedVisaTypes = [...currentVisaTypes, visaType]
    const updatedJson = JSON.stringify(updatedVisaTypes)

    await db.execute({
      sql: `UPDATE visa_processing_notifications
            SET visa_types = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [updatedJson, notificationId]
    })

    console.log(`[ProcessingNotifier] Updated notification #${notificationId} for ${applicationDate} with new visa type: ${visaType} (total: ${updatedVisaTypes.join(', ')})`)

    const realtimePayload = {
      type: 'visa_processing_started' as const,
      notificationId,
      applicationDate,
      visaTypes: updatedVisaTypes,
      message,
      createdAt
    }

    // Broadcast update to web cabinet
    publishToAllUsers(realtimePayload).catch((err: Error) => {
      console.error('[ProcessingNotifier] Web broadcast update failed:', err.message)
    })

    return
  }

  // 2. No notification exists yet — atomically create initial record
  const initialVisaTypes = [visaType]
  const initialJson = JSON.stringify(initialVisaTypes)

  const insertResult = await db.execute({
    sql: `INSERT OR IGNORE INTO visa_processing_notifications
          (type, application_date, visa_types, message, triggered_by_user_id, triggered_by_passport)
          VALUES ('visa_processing_started', ?, ?, ?, ?, ?)`,
    args: [applicationDate, initialJson, message, triggeredByUserId, triggeredByPassport]
  })

  if (!insertResult.rowsAffected || insertResult.rowsAffected === 0) {
    // Concurrent insert race condition — re-run function recursively to handle as update
    console.log(`[ProcessingNotifier] Concurrent insert race for ${applicationDate} — re-evaluating...`)
    return tryCreateProcessingNotification(db, rawApplicationDate, rawVisaType, triggeredByUserId, triggeredByPassport)
  }

  // Fetch newly created record
  const newRowRes = await db.execute({
    sql: `SELECT id, created_at FROM visa_processing_notifications
          WHERE type = 'visa_processing_started' AND application_date = ?`,
    args: [applicationDate]
  })

  const notificationId = Number(newRowRes.rows[0]?.id ?? 0)
  const createdAt = String(newRowRes.rows[0]?.created_at ?? new Date().toISOString())

  console.log(`[ProcessingNotifier] Created initial notification #${notificationId} for ${applicationDate} (${visaType})`)

  const realtimePayload = {
    type: 'visa_processing_started' as const,
    notificationId,
    applicationDate,
    visaTypes: initialVisaTypes,
    message,
    createdAt
  }

  // Broadcast initial event to web cabinet
  publishToAllUsers(realtimePayload).catch((err: Error) => {
    console.error('[ProcessingNotifier] Initial web broadcast failed:', err.message)
  })
}
