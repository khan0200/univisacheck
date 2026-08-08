/**
 * server/utils/global-telegram.ts
 *
 * Sends or edits a global "Viza berishni boshladi" Telegram message to every
 * cabinet_subscriber — i.e. every Telegram account linked to any UniVisaChecker cabinet.
 *
 * Telegram Edit Behavior:
 * - If a Telegram message was ALREADY sent to a subscriber for this notification_id,
 *   it uses Telegram Bot API `editMessageText` to update the message in place when new
 *   visa types are detected.
 * - Telegram `message_id`s are tracked in `telegram_notification_messages`.
 *
 * Failures are logged and isolated — they do not roll back DB notifications.
 */

import { getTursoClient } from './turso'

export interface GlobalTelegramPayload {
  notificationId: number
  applicationDate: string
  visaTypes: string[]
  message: string
}

/** Format applicationDate YYYY-MM-DD for Uzbek display (e.g. 2026-07-20 -> 20-iyul). */
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

function cleanVisaTypeCode(raw: string): string {
  if (!raw) return ''
  const str = String(raw).trim()
  const match = str.match(/([A-Z]-\d+(?:-\d+)?)/i)
  if (match && match[1]) {
    return match[1].toUpperCase()
  }
  return str
}

function buildTelegramMessage(payload: GlobalTelegramPayload, lang: string): string {
  const dateStr = formatDateUz(payload.applicationDate)
  const cleanedTypes = payload.visaTypes.map(t => cleanVisaTypeCode(t)).filter(Boolean)
  const isEn = lang === 'en'
  const typeLabel = isEn ? 'Visa type' : 'Viza turi'
  const typeValue = cleanedTypes.join(', ')

  return [
    `Elchixona ${dateStr} kuni hujjat topshirganlarga viza berishni boshladi.`,
    '',
    `${typeLabel}: ${typeValue}`
  ].join('\n')
}

export async function sendGlobalTelegramBroadcast(payload: GlobalTelegramPayload): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('[GlobalTelegram] Missing TELEGRAM_BOT_TOKEN — skipping broadcast.')
    return
  }

  const db = await getTursoClient()

  // 1. Fetch all linked Telegram subscribers
  const subscribers = await (async () => {
    try {
      const result = await db.execute(
        `SELECT DISTINCT telegram_id, COALESCE(lang, 'uz') as lang
         FROM cabinet_subscribers
         WHERE telegram_id IS NOT NULL`
      )
      return result.rows
        .filter((r: Record<string, unknown>) => r.telegram_id)
        .map((r: Record<string, unknown>) => ({
          telegram_id: Number(r.telegram_id),
          lang: String(r.lang || 'uz')
        }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[GlobalTelegram] Subscriber DB lookup failed:', msg)
      return null
    }
  })()

  if (!subscribers || subscribers.length === 0) {
    console.log('[GlobalTelegram] No linked Telegram subscribers — skipping.')
    return
  }

  // 2. Fetch existing sent message IDs for this notification
  const messageMap = new Map<number, number>()
  try {
    const msgResult = await db.execute({
      sql: `SELECT telegram_id, message_id FROM telegram_notification_messages WHERE notification_id = ?`,
      args: [payload.notificationId]
    })
    for (const row of msgResult.rows as Record<string, unknown>[]) {
      messageMap.set(Number(row.telegram_id), Number(row.message_id))
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GlobalTelegram] Existing message_id lookup failed:', msg)
  }

  console.log(`[GlobalTelegram] Processing broadcast to ${subscribers.length} subscribers (edit count: ${messageMap.size})...`)

  // 3. Send or edit message per subscriber
  const results = await Promise.allSettled(
    subscribers.map(async ({ telegram_id: chatId, lang }) => {
      const text = buildTelegramMessage(payload, lang)
      const existingMessageId = messageMap.get(chatId)

      if (existingMessageId) {
        // Edit existing Telegram message using editMessageText
        const editRes = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: existingMessageId,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          })
        })
        const data = (await editRes.json()) as { ok: boolean, description?: string }
        if (!data.ok) {
          console.warn(`[GlobalTelegram] editMessageText failed for chat ${chatId}:`, data.description)
        }
        return data
      } else {
        // Send new Telegram message
        const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          })
        })
        const data = (await sendRes.json()) as { ok: boolean, result?: { message_id: number } }
        if (data.ok && data.result?.message_id) {
          // Store newly generated message_id
          await db.execute({
            sql: `INSERT OR REPLACE INTO telegram_notification_messages
                  (notification_id, telegram_id, message_id, updated_at)
                  VALUES (?, ?, ?, datetime('now'))`,
            args: [payload.notificationId, chatId, data.result.message_id]
          }).catch((dbErr: unknown) => {
            const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
            console.error('[GlobalTelegram] Failed to save message_id:', msg)
          })
        }
        return data
      }
    })
  )

  const failed = results.filter(
    r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.ok)
  )
  if (failed.length > 0) {
    console.warn(`[GlobalTelegram] ${failed.length}/${subscribers.length} operations failed.`)
  } else {
    console.log(`[GlobalTelegram] Broadcast complete — ${subscribers.length} processed.`)
  }
}
