/**
 * server/utils/telegram-notifier.ts
 *
 * Consolidated helper to send Telegram status update alerts to connected cabinet subscribers.
 * Exposes sendTelegramNotification which is called both by the /api/notify-telegram route
 * and by the queue worker.
 */

import { getTursoClient } from './turso'
import { isSameStatus, getDisplayStatus, getStatusEmoji as getStatusEmojiFromUtils, getStatusDescription } from './visa-status'

function escapeTelegramText(value: unknown): string {
  return String(value || '').replace(/[<>&]/g, '')
}

function getStatusEmojiFormatted(status: unknown): string {
  return getStatusEmojiFromUtils(status)
}

function formatStatusDisplay(status: unknown): string {
  return getDisplayStatus(status)
}

function formatLastChecked(dateString: string, lang = 'uz'): string {
  const today = lang === 'en' ? 'Today' : 'Bugun'
  if (!dateString) return lang === 'en' ? 'Never' : 'Hech qachon'
  const date = new Date(dateString)
  try {
    const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' })
    const dateStr = date.toLocaleDateString('en-US', { timeZone: 'Asia/Tashkent' })

    const timePart = date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
    if (todayStr === dateStr) {
      return `${today}, ${timePart}`
    } else {
      const datePart = date.toLocaleDateString('en-US', {
        timeZone: 'Asia/Tashkent',
        month: 'short',
        day: 'numeric'
      })
      return `${datePart}, ${timePart}`
    }
  } catch {
    return today
  }
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


export interface TelegramNotificationPayload {
  fullName: string
  passport: string
  studentId?: string
  visaType: string
  statusOfResidence?: string
  applicationNo?: string
  birthday: string
  oldStatus: string
  newStatus: string
  applicationDate?: string
  rejectionReason?: string
  previousRejectionReason?: string
  invitingCompany?: string
  entryDate?: string
  pdfUrl?: string
}

export async function sendTelegramNotification(userId: number, payload: TelegramNotificationPayload) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('[Telegram Notifier] Missing TELEGRAM_BOT_TOKEN. Skipping notification.')
    return { ok: false, skipped: 'Missing token' }
  }

  const db = await getTursoClient()

  interface SubscriberRow {
    telegram_id: number
    lang: string
  }

  // 1. Look up Telegram subscribers
  let subscribers: SubscriberRow[]
  try {
    const subsResult = await db.execute({
      sql: `SELECT cs.telegram_id, COALESCE(cs.lang, 'uz') as lang
            FROM cabinet_subscribers cs WHERE cs.cabinet_id = ?`,
      args: [userId]
    })
    subscribers = (subsResult.rows as Record<string, unknown>[]).filter(r => r.telegram_id).map(r => ({
      telegram_id: Number(r.telegram_id),
      lang: String(r.lang || 'uz')
    }))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram Notifier] DB lookup error:', msg)
    return { ok: false, error: msg }
  }

  if (subscribers.length === 0) {
    return { ok: true, skipped: 'No subscribers connected' }
  }

  // 2. Validate ownership of student and check last_notified_status
  let currentDbStatus = ''
  let lastNotifiedStatus = ''
  try {
    const studentResult = await db.execute({
      sql: 'SELECT passport, status, "lastNotifiedStatus", last_notified_status FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
      args: [payload.passport, userId]
    })
    if (studentResult.rows.length === 0) {
      return { ok: true, skipped: 'Student not in cabinet' }
    }
    const studentRow = studentResult.rows[0] as Record<string, unknown>
    currentDbStatus = String(studentRow.status || '')
    lastNotifiedStatus = String(studentRow.lastNotifiedStatus || studentRow.last_notified_status || '')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram Notifier] DB verify error:', msg)
    return { ok: false, error: msg }
  }

  const {
    fullName: rawFullName,
    passport: rawPassport,
    visaType: rawVisaType,
    applicationNo: rawAppNo,
    birthday: rawBirthday,
    oldStatus: rawOldStatus,
    newStatus: rawNewStatus,
    applicationDate: rawAppDate,
    rejectionReason: rawRejReason,
    previousRejectionReason: rawPrevRej,
    invitingCompany: rawCompany,
    entryDate: rawEntryDate
  } = payload

  // ── Bulletproof Guards: NEVER send if status hasn't genuinely changed ──

  // Guard 1: Never re-notify if this student was already notified for this exact same normalized status
  if (lastNotifiedStatus && isSameStatus(lastNotifiedStatus, rawNewStatus)) {
    console.log(`[Telegram Notifier] Skipping — student ${rawPassport} already notified for status (${lastNotifiedStatus} == ${rawNewStatus})`)
    return { ok: true, skipped: 'Already notified for this status' }
  }

  // Guard 2: Never send if the student's existing DB status matches the new status
  if (currentDbStatus && isSameStatus(currentDbStatus, rawNewStatus)) {
    console.log(`[Telegram Notifier] Skipping — DB status already matches new status (${currentDbStatus} == ${rawNewStatus})`)
    return { ok: true, skipped: 'DB status already matches new status' }
  }

  // Guard 3: Never send if the provided old status matches the new status
  if (rawOldStatus && isSameStatus(rawOldStatus, rawNewStatus)) {
    console.log(`[Telegram Notifier] Skipping — old status matches new status (${rawOldStatus} == ${rawNewStatus})`)
    return { ok: true, skipped: 'Normalized status unchanged — no change' }
  }

  // Guard 4: Initial check discovery of baseline in-progress status (PENDING -> UNDER_REVIEW / RECEIVED)
  // When a student is first added to the system, discovering they are already Under Review / Received is
  // baseline data discovery, NOT a new status decision/change event.
  const isOldPending = !rawOldStatus || isSameStatus(rawOldStatus, 'PENDING') || isSameStatus(currentDbStatus, 'PENDING')
  const isNewInProgress = isSameStatus(rawNewStatus, 'UNDER_REVIEW') || isSameStatus(rawNewStatus, 'RECEIVED') || isSameStatus(rawNewStatus, 'PENDING')
  if (isOldPending && isNewInProgress) {
    console.log(`[Telegram Notifier] Skipping — initial baseline discovery for ${rawPassport} (${rawNewStatus}), not a status change transition`)
    // Record baseline status as last notified so future checks know the baseline
    try {
      await db.execute({
        sql: 'UPDATE students SET "lastNotifiedStatus" = ?, last_notified_status = ? WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
        args: [rawNewStatus, rawNewStatus, rawPassport, userId]
      })
    } catch {
      // Non-critical
    }
    return { ok: true, skipped: 'Initial baseline status discovery — not a status transition' }
  }

  const fullName = escapeTelegramText(rawFullName)
  const passport = escapeTelegramText(rawPassport)
  const visaType = escapeTelegramText(rawVisaType || 'Embassy')
  const applicationNo = escapeTelegramText(rawAppNo)
  const birthday = escapeTelegramText(rawBirthday)
  const newStatus = escapeTelegramText(rawNewStatus)
  const applicationDate = escapeTelegramText(rawAppDate)
  const rejectionReason = escapeTelegramText(rawRejReason)
  const previousRejectionReason = escapeTelegramText(rawPrevRej)
  const invitingCompany = escapeTelegramText(rawCompany)

  const rawResidence = cleanVisaTypeCode(payload.statusOfResidence || '')
  const rawTypeClean = cleanVisaTypeCode(rawVisaType || '')

  let displayVisaType = 'Embassy'
  if (rawResidence) {
    displayVisaType = rawResidence
  } else if (rawTypeClean && !['EMBASSY', 'E-VISA', 'REGIONAL'].includes(rawTypeClean.toUpperCase())) {
    displayVisaType = rawTypeClean
  } else if (rawVisaType) {
    displayVisaType = rawVisaType
  }

  const emoji = getStatusEmojiFormatted(newStatus)
  const isApproved = ['approved', 'visa used', 'issued'].some(s => newStatus.toLowerCase().includes(s))
  const canDownloadPdf = isApproved && (visaType || '').toLowerCase() !== 'e-visa'
  const nowIso = new Date().toISOString()

  function buildMessage(lang: string): string {
    const desc = getStatusDescription(newStatus, lang)
    const checkedStr = formatLastChecked(nowIso, lang)
    const isApprovedNotif = ['APPROVED', 'USED', 'ISSUED'].some(s => newStatus.toUpperCase().includes(s))
    const labels = {
      title: lang === 'en' ? '🔍 Visa Status Check' : '🔍 Visa statusini tekshirish',
      visaLbl: lang === 'en' ? '✈️ Visa type:' : '✈️ Visa turi:',
      partner: lang === 'en' ? '🏢 Partner:' : '🏢 Taklif:',
      appNo: lang === 'en' ? '📄 Application No:' : '📄 Ariza raqami:',
      submitted: lang === 'en' ? '📅 Submitted date:' : '📅 Topshirilgan sana:',
      status: lang === 'en' ? '🔄 Status:' : '🔄 Holati:',
      givenDate: lang === 'en' ? '🗓️ Visa given date:' : '🗓️ Viza berilgan sana:',
      checked: lang === 'en' ? '🕒 Checked:' : '🕒 Tekshirildi:',
      result: lang === 'en' ? 'Result:' : 'Natija:',
      reason: lang === 'en' ? '⚠️ Reason:' : '⚠️ Sababi:',
      prevResult: lang === 'en' ? 'Previous application result:\n🚫 Reason:' : 'Bundan oldingi ariza natijasi:\n🚫 Sababi:'
    }
    return [
      labels.title, '',
      `👤 ${fullName.toUpperCase()}`,
      `🛂 ${passport.toUpperCase()}`,
      `🎂 ${birthday}`, '',
      `${labels.visaLbl} ${displayVisaType}`,
      ...((visaType === 'E-Visa' || visaType === 'Regional') && invitingCompany ? [`${labels.partner} ${invitingCompany}`] : []),
      ...((visaType === 'E-Visa' || visaType === 'Regional') && applicationNo ? [`${labels.appNo} ${applicationNo}`] : []),
      `${labels.submitted} ${applicationDate || 'N/A'}`,
      `${labels.status} ${emoji} ${formatStatusDisplay(newStatus)}`,
      ...(isApprovedNotif && rawEntryDate && rawEntryDate !== applicationDate ? [`${labels.givenDate} ${escapeTelegramText(rawEntryDate)}`] : []),
      '',
      `${labels.checked} ${checkedStr}`, '',
      `${labels.result} ${desc}`,
      ...(rejectionReason ? [`${labels.reason} ${rejectionReason}`] : []),
      ...(previousRejectionReason ? [`${labels.prevResult} ${previousRejectionReason}`] : [])
    ].join('\n')
  }

  function buildMarkup(lang: string) {
    const refreshBtn = lang === 'en' ? '🔄 Refresh' : '🔄 Yangilash'
    const pdfBtn = lang === 'en' ? '📥 Visa (pdf)' : '📥 Viza (pdf)'
    return {
      inline_keyboard: canDownloadPdf
        ? [
            [{ text: refreshBtn, callback_data: `refresh:${passport}` }],
            [{ text: pdfBtn, callback_data: `download_pdf:${passport}` }]
          ]
        : [
            [{ text: refreshBtn, callback_data: `refresh:${passport}` }]
          ]
    }
  }

  const results = await Promise.allSettled(
    subscribers.map(({ telegram_id: chatId, lang }) => {
      const msgText = buildMessage(lang || 'uz')
      const reply_markup = buildMarkup(lang || 'uz')
      return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msgText,
          parse_mode: 'Markdown',
          reply_markup,
          disable_web_page_preview: true
        })
      }).then(r => r.json())
    })
  )

  const successfulSends = results.filter(r => r.status === 'fulfilled' && (r.value as { ok?: boolean })?.ok)
  if (successfulSends.length > 0) {
    try {
      await db.execute({
        sql: 'UPDATE students SET "lastNotifiedStatus" = ?, last_notified_status = ? WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
        args: [newStatus, newStatus, passport, userId]
      })
    } catch (err: unknown) {
      console.error('[Telegram Notifier] Failed to update lastNotifiedStatus in DB:', err instanceof Error ? err.message : String(err))
    }
  }

  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as { ok?: boolean })?.ok))
  if (failed.length > 0) {
    console.error('[Telegram Notifier] Some sends failed:', failed.length)
  }

  return {
    ok: true,
    notified: subscribers.length,
    failed: failed.length
  }
}
