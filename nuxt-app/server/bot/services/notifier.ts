/**
 * server/bot/services/notifier.ts
 *
 * Telegram notification dispatcher for visa status changes.
 * Sends notifications formatted with complete student details, status transitions,
 * helpful explanations, and interactive refresh/download buttons.
 */

import { getTursoClient } from '../../utils/turso'
import type { Lang } from '../i18n'

/** Reference to the bot instance — set by bot/index.ts after initialization. */
let botApi: { sendMessage: (chatId: number, text: string, options?: Record<string, unknown>) => Promise<unknown> } | null = null

/**
 * Registers the bot API reference so the notifier can send messages.
 * Called once during bot initialization.
 */
export function setBotApi(api: typeof botApi) {
  botApi = api
}

export interface NotificationStudentData {
  fullName?: string
  birthday?: string
  visaType?: string
  partner?: string
  university?: string
  applicationNo?: string
  applicationDate?: string
  decisionDate?: string
  rejectionReason?: string
  previousRejectionReason?: string
  pdfUrl?: string
}

function getHeaderTitle(lang: Lang, status: string): string {
  const s = (status || '').toUpperCase().replace(/_/g, ' ').trim()
  if (s.includes('APPROV') || s.includes('ISSUED')) {
    return lang === 'uz' ? '🎉 VIZA TASDIQLANDI' : '🎉 VISA APPROVED'
  }
  if (s.includes('UNDER REVIEW') || s.includes('REVIEW') || s.includes('심사중') || s.includes('처리중')) {
    return lang === 'uz' ? '🔎 KO\'RIB CHIQILMOQDA' : '🔎 UNDER REVIEW'
  }
  if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('불허')) {
    return lang === 'uz' ? '❌ VIZA RAD ETILDI' : '❌ VISA REJECTED'
  }
  if (s.includes('SUPPLEMENT NEEDED') || s.includes('보완요청') || s.includes('보완대기')) {
    return lang === 'uz' ? '⚠️ QO\'SHIMCHA HUJJAT TALAB ETILADI' : '⚠️ SUPPLEMENT NEEDED'
  }
  if (s.includes('SUPPLEMENT SUBMITTED') || s.includes('보완완료') || s.includes('보완제출')) {
    return lang === 'uz' ? '📝 QO\'SHIMCHA HUJJAT TOPSHIRILDI' : '📝 SUPPLEMENT SUBMITTED'
  }
  if (s.includes('RECEIVED') || s.includes('APP/') || s.includes('접수')) {
    return lang === 'uz' ? '📥 ARIZA QABUL QILINDI' : '📥 APPLICATION RECEIVED'
  }
  if (s.includes('VISA USED') || s.includes('사용완료')) {
    return lang === 'uz' ? '✅ VIZA ISHLATILGAN' : '✅ VISA USED'
  }
  return lang === 'uz' ? '⏳ KUTILMOQDA' : '⏳ PENDING'
}

function getStatusEmoji(status: string): string {
  const s = (status || '').toUpperCase().replace(/_/g, ' ').trim()
  if (s.includes('APPROV') || s.includes('ISSUED')) return '🟢'
  if (s.includes('UNDER REVIEW') || s.includes('REVIEW') || s.includes('심사중') || s.includes('처리중')) return '🔵'
  if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('불허')) return '🔴'
  if (s.includes('SUPPLEMENT NEEDED') || s.includes('보완요청') || s.includes('보완대기')) return '🟠'
  if (s.includes('SUPPLEMENT SUBMITTED') || s.includes('보완완료') || s.includes('보완제출')) return '🟣'
  if (s.includes('RECEIVED') || s.includes('APP/') || s.includes('접수')) return '🟡'
  if (s.includes('VISA USED') || s.includes('사용완료')) return '🔘'
  return '🔷'
}

function getCanonicalStatusText(status: string): string {
  const s = (status || '').toUpperCase().replace(/_/g, ' ').trim()
  if (s.includes('APPROV') || s.includes('ISSUED')) return 'APPROVED'
  if (s.includes('UNDER REVIEW') || s.includes('REVIEW') || s.includes('심사중') || s.includes('처리중')) return 'UNDER REVIEW'
  if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('불허')) return 'REJECTED'
  if (s.includes('SUPPLEMENT SUBMITTED') || s.includes('보완완료') || s.includes('보완제출')) return 'SUPPLEMENT SUBMITTED'
  if (s.includes('SUPPLEMENT NEEDED') || s.includes('보완요청') || s.includes('보완대기')) return 'SUPPLEMENT NEEDED'
  if (s.includes('RECEIVED') || s.includes('APP/') || s.includes('접수')) return 'RECEIVED'
  if (s.includes('VISA USED') || s.includes('사용완료')) return 'VISA USED'
  return 'PENDING'
}

function getStatusExplanation(lang: Lang, status: string, isEVisa: boolean = false): string {
  const s = (status || '').toUpperCase().replace(/_/g, ' ').trim()
  if (s.includes('APPROV') || s.includes('ISSUED')) {
    if (isEVisa) {
      return lang === 'uz'
        ? 'Tabriklaymiz! Viza arizasi tasdiqlandi.'
        : 'Congratulations! The visa application has been approved.'
    }
    if (lang === 'uz') {
      return 'Tabriklaymiz! Viza arizasi tasdiqlandi.\n\n➡️ Keyingi qadam: Viza PDF faylini yuklab oling va pasport ma\'lumotlari bilan solishtiring.'
    } else {
      return 'Congratulations! The visa application has been approved.\n\n➡️ Next step: Download the visa PDF and verify the details against the passport.'
    }
  }
  if (s.includes('UNDER REVIEW') || s.includes('REVIEW') || s.includes('심사중') || s.includes('처리중')) {
    return lang === 'uz' ? 'Ariza faol ko\'rib chiqish bosqichiga o\'tdi.' : 'The application is actively being reviewed.'
  }
  if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('불허')) {
    return lang === 'uz' ? 'Afsuski, viza arizasi rad etildi.' : 'Unfortunately, the visa application was rejected.'
  }
  if (s.includes('SUPPLEMENT NEEDED') || s.includes('보완요청') || s.includes('보완대기')) {
    return lang === 'uz' 
      ? 'Qo\'shimcha hujjatlar talab qilinmoqda. Iltimos, so\'ralgan hujjatlarni taqdim eting.' 
      : 'Additional documents are required. Please submit the requested documents.'
  }
  if (s.includes('SUPPLEMENT SUBMITTED') || s.includes('보완완료') || s.includes('보완제출')) {
    return lang === 'uz' 
      ? 'Qo\'shimcha hujjatlar topshirildi va ko\'rib chiqilmoqda.' 
      : 'Supplement documents have been submitted and are under review.'
  }
  if (s.includes('RECEIVED') || s.includes('APP/') || s.includes('접수')) {
    return lang === 'uz' ? 'Ariza muvaffaqiyatli qabul qilindi.' : 'Application has been successfully received.'
  }
  if (s.includes('VISA USED') || s.includes('사용완료')) {
    return lang === 'uz' ? 'Viza allaqachon ishlatilgan.' : 'The visa has already been used.'
  }
  return lang === 'uz' ? 'Ariza holati kutilmoqda.' : 'The application is pending.'
}

function getFormattedTimestamp(lang: Lang): string {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
  return lang === 'uz' ? `🕒 Tekshirildi: Bugun, ${timeStr}` : `🕒 Checked: Today, ${timeStr}`
}

export function formatStatusChangeNotification(
  lang: Lang,
  passport: string,
  oldStatus: string,
  newStatus: string,
  data: NotificationStudentData
): string {
  const lines: string[] = []

  // Header
  lines.push(getHeaderTitle(lang, newStatus))
  lines.push('')

  // Student identity
  if (data.fullName) {
    lines.push(`👤 ${data.fullName.toUpperCase().trim()}`)
  }
  lines.push(`🛂 ${passport.toUpperCase().trim()}`)
  if (data.birthday) {
    lines.push(`🎂 ${data.birthday.trim()}`)
  }
  lines.push('')

  // Application details
  const visaType = data.visaType || 'Embassy'
  const isEVisa = visaType.toLowerCase().includes('e-visa') || visaType.toLowerCase().includes('evisa')

  if (data.visaType) {
    const label = lang === 'uz' ? 'Visa turi' : 'Visa type'
    lines.push(`✈️ ${label}: ${data.visaType.trim()}`)
  }

  const partnerName = data.partner || data.university
  if (partnerName) {
    lines.push(`🏢 Partner: ${partnerName.trim()}`)
  }

  if (data.applicationNo) {
    const label = lang === 'uz' ? 'Ariza raqami' : 'Application No'
    lines.push(`📄 ${label}: ${data.applicationNo.trim()}`)
  }

  if (data.applicationDate) {
    const label = lang === 'uz' ? 'Topshirilgan' : 'Submitted'
    lines.push(`📅 ${label}: ${data.applicationDate.trim()}`)
  }

  // Transition line with emojis
  const oldEmoji = getStatusEmoji(oldStatus)
  const oldText = getCanonicalStatusText(oldStatus)
  const newEmoji = getStatusEmoji(newStatus)
  const newText = getCanonicalStatusText(newStatus)
  const statusLabel = lang === 'uz' ? 'Holati' : 'Status'
  lines.push(`🔄 ${statusLabel}: ${oldEmoji} ${oldText} → ${newEmoji} ${newText}`)

  // Visa issued date (if approved and available)
  const isApproved = newStatus.toUpperCase().includes('APPROV') || newStatus.toUpperCase().includes('ISSUED')
  if (isApproved && data.decisionDate) {
    const label = lang === 'uz' ? 'Viza berilgan' : 'Visa issued'
    lines.push(`🗓 ${label}: ${data.decisionDate.trim()}`)
  }

  // Rejection reason (if cancelled and available)
  const isCancelled = newStatus.toUpperCase().includes('CANCEL') || newStatus.toUpperCase().includes('REJECT')
  if (isCancelled && data.rejectionReason) {
    const label = lang === 'uz' ? 'Rad etish sababi' : 'Rejection reason'
    lines.push(`🚫 ${label}: ${data.rejectionReason.trim()}`)
  }

  lines.push('')

  // Explanation and next steps (omits PDF text for E-Visa)
  lines.push(getStatusExplanation(lang, newStatus, isEVisa))

  // Previous rejection reason if student had a prior rejection on visa.go.kr
  if (data.previousRejectionReason) {
    lines.push('')
    lines.push(lang === 'uz' ? 'Oldingi ariza natijasi:' : 'Previous application result:')
    lines.push(`${lang === 'uz' ? '🚫 Sababi' : '🚫 Reason'}: ${data.previousRejectionReason}`)
  }

  lines.push('')

  // Timestamp
  lines.push(getFormattedTimestamp(lang))

  return lines.join('\n')
}

/**
 * Sends Telegram notifications to all subscribers of a consulting
 * when a student's visa status changes.
 */
export async function sendTelegramStatusNotification(
  passport: string,
  userId: number,
  oldStatus: string,
  newStatus: string,
  studentData: NotificationStudentData = {}
): Promise<void> {
  if (!botApi) {
    console.warn('[Bot Notifier] Bot API not initialized, skipping notification')
    return
  }

  try {
    const db = await getTursoClient()

    // Find all Telegram users connected to this consulting
    const subscribers = await db.execute({
      sql: 'SELECT telegram_id, lang FROM cabinet_subscribers WHERE cabinet_id = ? AND cabinet_id > 0',
      args: [userId]
    })

    if (subscribers.rows.length === 0) return

    // Fallback: if studentData is missing name or birthday or applicationDate, fetch from DB
    let enrichedData: NotificationStudentData = { ...studentData }
    if (!enrichedData.fullName || !enrichedData.birthday || !enrichedData.applicationDate || !enrichedData.visaType) {
      try {
        const studentRes = await db.execute({
          sql: 'SELECT fullName, fullname, birthday, visaType, visa_type, applicationNo, application_no, applicationDate, application_date, university, pdfUrl FROM students WHERE passport = ? AND userId = ? LIMIT 1',
          args: [passport.toUpperCase().trim(), userId]
        })
        if (studentRes.rows.length > 0) {
          const row = studentRes.rows[0] as Record<string, unknown>
          enrichedData = {
            fullName: enrichedData.fullName || String(row.fullName || row.fullname || ''),
            birthday: enrichedData.birthday || String(row.birthday || ''),
            visaType: enrichedData.visaType || String(row.visaType || row.visa_type || 'Embassy'),
            applicationNo: enrichedData.applicationNo || String(row.applicationNo || row.application_no || ''),
            applicationDate: enrichedData.applicationDate || String(row.applicationDate || row.application_date || ''),
            university: enrichedData.university || String(row.university || ''),
            pdfUrl: enrichedData.pdfUrl || String(row.pdfUrl || ''),
            partner: enrichedData.partner || String(row.university || ''),
            decisionDate: enrichedData.decisionDate,
            rejectionReason: enrichedData.rejectionReason
          }
        }
      } catch (lookupErr) {
        console.warn('[Bot Notifier] Fallback lookup failed:', lookupErr)
      }
    }

    const visaType = enrichedData.visaType || 'Embassy'
    const isEVisa = visaType.toLowerCase().includes('e-visa') || visaType.toLowerCase().includes('evisa')

    const isApproved = newStatus.toUpperCase().includes('APPROV') ||
                       newStatus.toUpperCase().includes('ISSUED') ||
                       newStatus.toUpperCase().includes('VISA USED')

    for (const row of subscribers.rows) {
      const telegramId = Number((row as Record<string, unknown>).telegram_id)
      const lang = (String((row as Record<string, unknown>).lang || 'uz')) as Lang

      if (!telegramId || isNaN(telegramId)) continue

      try {
        const text = formatStatusChangeNotification(
          lang,
          passport,
          oldStatus,
          newStatus,
          enrichedData
        )

        const inlineKeyboard: Array<Array<{ text: string, callback_data: string }>> = [
          [{ text: lang === 'uz' ? '🔄 Yangilash' : '🔄 Refresh', callback_data: `visa_refresh:${passport}` }]
        ]

        // E-Visa does not have/support PDF download — only show for non-E-Visa (e.g. Embassy)
        if (isApproved && !isEVisa && enrichedData.pdfUrl) {
          inlineKeyboard.push([
            { text: lang === 'uz' ? '📥 Vizani yuklash' : '📥 Download Visa', callback_data: `visa_download:${passport}` }
          ])
        }

        await botApi.sendMessage(telegramId, text, {
          reply_markup: { inline_keyboard: inlineKeyboard }
        })
        console.log(`[Bot Notifier] Sent status notification to ${telegramId} for ${passport}: ${oldStatus} → ${newStatus}`)
      } catch (sendErr) {
        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr)
        console.error(`[Bot Notifier] Failed to notify ${telegramId}:`, msg)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Bot Notifier] Error querying subscribers:', msg)
  }
}
