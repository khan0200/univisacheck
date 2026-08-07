import { getTursoClient } from '../utils/turso'
import { verifyToken } from '../utils/auth'
import { apiError } from '../utils/api-error'

function escapeTelegramText(value: unknown): string {
  return String(value || '').replace(/[<>&]/g, '')
}

function normalizeStatus(status: unknown): string {
  const s = String(status || '').trim().toLowerCase()
  if (!s || s === 'pending' || s === 'unknown' || s.includes('error')) return 'pending'
  if (s.includes('approved') || s.includes('visa used') || s.includes('issued')) return 'approved'
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled'
  if (s.includes('received') || s.includes('app/')) return 'received'
  if (s.includes('under review')) return 'under review'
  return s
}

function isSameStatus(status1: unknown, status2: unknown): boolean {
  return normalizeStatus(status1) === normalizeStatus(status2)
}

function getStatusEmoji(status: unknown): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('approved') || normalized.includes('visa used')) return '🟢'
  if (normalized.includes('cancel') || normalized.includes('reject')) return '🔴'
  if (normalized.includes('received') || normalized.includes('app/')) return '🟠'
  if (normalized.includes('under review')) return '🔵'
  return '🔷'
}

function getStatusDescription(status: unknown, lang = 'uz'): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('approved') || normalized.includes('visa used') || normalized.includes('issued')) {
    return lang === 'en' ? 'Congratulations 🎉' : 'Tabriklaymiz 🎉'
  }
  if (normalized.includes('cancel') || normalized.includes('reject')) {
    return lang === 'en' ? 'Your application was rejected.' : 'Arizangiz rad etildi.'
  }
  if (normalized.includes('received') || normalized.includes('app/')) {
    return lang === 'en' ? '⏳ Your application is being processed.' : '⏳ Arizangiz jarayonda.'
  }
  if (normalized.includes('under review')) {
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

export default defineEventHandler(async (event) => {
  // ── Require JWT authentication ─────────────────────────────────────────
  const authUser = await verifyToken(event)
  if (!authUser || !authUser.userId) apiError(401, 'Unauthorized. Please log in.')

  const body = (await readBody(event)) || {}
  const passport = (body.passport || '').toUpperCase().trim()

  if (!passport) apiError(400, 'Missing passport in request body')

  const db = await getTursoClient()

  // ── Look up ALL Telegram subscribers for this cabinet (with their lang) ─
  let subscribers: { telegram_id: number, lang: string }[] = []
  try {
    const subsResult = await db.execute({
      sql: `SELECT cs.telegram_id, COALESCE(cs.lang, 'uz') as lang
            FROM cabinet_subscribers cs WHERE cs.cabinet_id = ?`,
      args: [authUser!.userId]
    })
    subscribers = (subsResult.rows as any[]).filter((r) => r.telegram_id)
  } catch (dbErr: any) {
    console.error('[Notify Telegram] DB lookup error:', dbErr.message)
    apiError(500, 'Database error looking up subscribers.')
  }

  // ── If cabinet has no connected Telegram subscribers, skip silently ───
  if (subscribers.length === 0) {
    return { ok: true, skipped: 'No Telegram subscribers connected to this cabinet' }
  }

  // ── Verify the student belongs to this user ───────────────────────────
  try {
    const studentResult = await db.execute({
      sql: 'SELECT passport FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
      args: [passport, authUser!.userId]
    })
    if (studentResult.rows.length === 0) {
      return { ok: true, skipped: 'Student not in your cabinet' }
    }
  } catch (dbErr: any) {
    console.error('[Notify Telegram] Student ownership check error:', dbErr.message)
    apiError(500, 'Database error verifying student.')
  }

  // ── Build and send the Telegram message ───────────────────────────────
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) apiError(500, 'Missing TELEGRAM_BOT_TOKEN environment variable')

  const fullName = escapeTelegramText(body.fullName)
  const visaType = escapeTelegramText(body.visaType || 'Embassy')
  const applicationNo = escapeTelegramText(body.applicationNo)
  const birthday = escapeTelegramText(body.birthday)
  const oldStatus = escapeTelegramText(body.oldStatus)
  const newStatus = escapeTelegramText(body.newStatus)
  const applicationDate = escapeTelegramText(body.applicationDate)
  const rejectionReason = escapeTelegramText(body.rejectionReason)
  const previousRejectionReason = escapeTelegramText(body.previousRejectionReason)
  const invitingCompany = escapeTelegramText(body.invitingCompany)

  if (oldStatus && isSameStatus(oldStatus, newStatus)) {
    return { ok: true, skipped: 'No actual status change (Pending and Unknown are equivalent)' }
  }

  const emoji = getStatusEmoji(newStatus)
  const isApproved = ['approved', 'visa used', 'issued'].some((s) => newStatus.toLowerCase().includes(s))
  const canDownloadPdf = isApproved && (visaType || '').toLowerCase() !== 'e-visa'
  const nowIso = new Date().toISOString()

  // ── Helper: build localised message text for one subscriber ──────────
  function buildMessage(lang: string): string {
    const desc = getStatusDescription(newStatus, lang)
    const checkedStr = formatLastChecked(nowIso, lang)
    const labels = {
      title: lang === 'en' ? '🔍 Visa Status Check' : '🔍 Visa statusini tekshirish',
      visaLbl: lang === 'en' ? '✈️ Visa type:' : '✈️ Visa turi:',
      partner: lang === 'en' ? '🏢 Partner:' : '🏢 Taklif:',
      appNo: lang === 'en' ? '📄 Application No:' : '📄 Ariza raqami:',
      submitted: lang === 'en' ? '📅 Submitted date:' : '📅 Topshirilgan sana:',
      status: lang === 'en' ? '🔄 Status:' : '🔄 Holati:',
      givenDate: lang === 'en' ? '🗓️ Visa given date:' : '🗓️ Visa berilgan sana:',
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
      `${labels.visaLbl} ${visaType === 'E-Visa' ? 'E-Visa' : visaType === 'Regional' ? 'Regional' : 'Embassy'}`,
      ...((visaType === 'E-Visa' || visaType === 'Regional') && invitingCompany ? [`${labels.partner} ${invitingCompany}`] : []),
      ...((visaType === 'E-Visa' || visaType === 'Regional') && applicationNo ? [`${labels.appNo} ${applicationNo}`] : []),
      `${labels.submitted} ${applicationDate || 'N/A'}`,
      `${labels.status} ${emoji} ${newStatus.toUpperCase()}`,
      ...(body.entryDate && body.entryDate !== applicationDate ? [`${labels.givenDate} ${escapeTelegramText(body.entryDate)}`] : []),
      '',
      `${labels.checked} ${checkedStr}`, '',
      `${labels.result} ${desc}`,
      ...(rejectionReason ? [`${labels.reason} ${rejectionReason}`] : []),
      ...(previousRejectionReason ? [`\n${labels.prevResult} ${previousRejectionReason}`] : [])
    ].join('\n')
  }

  // ── Build per-subscriber reply_markup ────────────────────────────────
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

  // ── Send message to EACH subscriber in their own language ─────────────
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
      }).then((r) => r.json())
    })
  )

  const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !(r as any).value?.ok))
  if (failed.length > 0) {
    console.error('[Notify Telegram] Some sends failed:', failed.length)
  }

  return {
    ok: true,
    notified: subscribers.length,
    failed: failed.length
  }
})
