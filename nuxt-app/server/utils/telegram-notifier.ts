/**
 * server/utils/telegram-notifier.ts
 *
 * Consolidated helper to send Telegram status update alerts to connected cabinet subscribers.
 * Exposes sendTelegramNotification which is called both by the /api/notify-telegram route
 * and by the queue worker.
 */

import { getTursoClient } from './turso'

function escapeTelegramText(value: unknown): string {
  return String(value || '').replace(/[<>&]/g, '')
}

function normalizeStatus(status: unknown): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) return 'pending'
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued') || s.includes('tasdiqlangan') || s.includes('ishlatilgan') || s.includes('허가') || s.includes('발급') || s.includes('사용완료')) return 'approved'
  if (s.includes('cancel') || s.includes('reject') || s.includes('bekor') || s.includes('rad') || s.includes('불허') || s.includes('취소') || s.includes('반려') || s.includes('returned')) return 'cancelled'
  if (s.includes('supplement submitted') || s.includes('supplement completed') || s.includes('보완완료') || s.includes('보완제출') || s.includes('보완접수')) return 'supplement submitted'
  if (s.includes('supplement') || s.includes('보완') || s.includes('qo\'shimcha') || s.includes('asking')) return 'supplement needed'
  if (s.includes('received') || s.includes('app/') || s.includes('qabul') || s.includes('접수') || s.includes('신청')) return 'received'
  if (s.includes('under review') || s.includes('ko\'rib') || s.includes('tayyorlanish') || s.includes('심사중') || s.includes('심사 중') || s.includes('처리중') || s.includes('처리 중')) return 'under review'
  return s
}

function isSameStatus(status1: unknown, status2: unknown): boolean {
  return normalizeStatus(status1) === normalizeStatus(status2)
}

function getStatusEmoji(status: unknown): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued') || normalized.includes('허가') || normalized.includes('발급')) return '🟢'
  if (normalized.includes('cancel') || normalized.includes('reject') || normalized.includes('불허') || normalized.includes('취소')) return '🔴'
  if (normalized.includes('supplement submitted') || normalized.includes('supplement completed') || normalized.includes('보완완료') || normalized.includes('보완제출') || normalized.includes('보완접수')) return '📝'
  if (normalized.includes('supplement') || normalized.includes('보완') || normalized.includes('qo\'shimcha') || normalized.includes('asking')) return '⚠️'
  if (normalized.includes('received') || normalized.includes('app/') || normalized.includes('접수') || normalized.includes('신청')) return '🟠'
  if (normalized.includes('under review') || normalized.includes('심사중') || normalized.includes('심사 중') || normalized.includes('처리중') || normalized.includes('처리 중')) return '🔵'
  return '🔷'
}

function getStatusEmojiFormatted(status: unknown): string {
  return getStatusEmoji(status)
}

function getStatusDescription(status: unknown, lang = 'uz'): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued') || normalized.includes('허가') || normalized.includes('발급')) {
    return lang === 'en' ? 'Congratulations 🎉' : 'Tabriklaymiz 🎉'
  }
  if (normalized.includes('cancel') || normalized.includes('reject') || normalized.includes('불허') || normalized.includes('취소')) {
    return lang === 'en' ? 'Your application was rejected.' : 'Arizangiz rad etildi.'
  }
  if (normalized.includes('supplement submitted') || normalized.includes('supplement completed') || normalized.includes('보완완료') || normalized.includes('보완제출') || normalized.includes('보완접수')) {
    return lang === 'en' ? '📝 Supplementary documents have been submitted and are under review.' : '📝 Qo\'shimcha hujjatlar topshirildi va ko\'rib chiqilmoqda.'
  }
  if (normalized.includes('supplement') || normalized.includes('보완') || normalized.includes('qo\'shimcha') || normalized.includes('asking')) {
    return lang === 'en' ? '⚠️ Additional documents required (Supplement Needed).' : '⚠️ Qo\'shimcha hujjatlar talab qilinmoqda (Qo\'shimcha hujjat kerak).'
  }
  if (normalized.includes('received') || normalized.includes('app/') || normalized.includes('접수') || normalized.includes('신청')) {
    return lang === 'en' ? '⏳ Your application is being processed.' : '⏳ Arizangiz jarayonda.'
  }
  if (normalized.includes('under review') || normalized.includes('심사중') || normalized.includes('심사 중') || normalized.includes('처리중') || normalized.includes('처리 중')) {
    return lang === 'en' ? '🔎 Under review.' : '🔎 Ko\'rib chiqilmoqda.'
  }
  return lang === 'en' ? 'Status updated.' : 'Status yangilandi.'
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

  // 2. Validate ownership of student
  try {
    const studentResult = await db.execute({
      sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
      args: [payload.passport, userId]
    })
    if (studentResult.rows.length === 0) {
      return { ok: true, skipped: 'Student not in cabinet' }
    }
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

  if (rawOldStatus && rawNewStatus && isSameStatus(rawOldStatus, rawNewStatus)) {
    return { ok: true, skipped: 'Normalized status unchanged — no change' }
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
      `${labels.status} ${emoji} ${newStatus.toUpperCase()}`,
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
