/**
 * server/utils/telegram-notifier.ts
 *
 * Sends Telegram visa-status alerts to a cabinet's connected subscribers.
 * Called by /api/notify-telegram, /api/check-status, /api/jobs/direct and the
 * queue worker.
 *
 * ── Why the send decision looks the way it does ─────────────────────────────
 * Every caller writes the new status to `students` BEFORE calling this helper.
 * The previous implementation then re-read that row and refused to send when
 * the row's status equalled the new status — which, after the caller's own
 * write, is *always* true. That guard could only ever produce false negatives
 * and silently dropped real transitions (e.g. UNDER REVIEW → APPROVED).
 *
 * `lastNotifiedStatus` is therefore the ONLY gate: it records what was last
 * actually announced to Telegram, so it is unaffected by the caller's write and
 * is the correct de-duplication key. `students.status` is never consulted for
 * the change decision.
 *
 * The row is still read — but only to confirm the student belongs to this
 * cabinet and to read `lastNotifiedStatus`.
 */

import { getTursoClient } from './turso'
import {
  isSameStatus,
  normalizeStatus,
  getDisplayStatus,
  getStatusEmoji,
  toDbStatus,
  type CanonicalStatus
} from './visa-status'

function escapeTelegramText(value: unknown): string {
  return String(value || '').replace(/[<>&]/g, '')
}

function formatLastChecked(dateString: string, lang: Lang = 'uz'): string {
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
    if (todayStr === dateStr) return `${today}, ${timePart}`
    const datePart = date.toLocaleDateString('en-US', {
      timeZone: 'Asia/Tashkent',
      month: 'short',
      day: 'numeric'
    })
    return `${datePart}, ${timePart}`
  } catch {
    return today
  }
}

function cleanVisaTypeCode(raw: string): string {
  if (!raw) return ''
  const str = String(raw).trim()
  const match = str.match(/([A-Z]-\d+(?:-\d+)?)/i)
  return match && match[1] ? match[1].toUpperCase() : str
}

type Lang = 'uz' | 'en'

// ── Per-status message copy ────────────────────────────────────────────────
// Each status gets its own headline, body and (optionally) a next-step line,
// instead of every transition reusing one generic template.

interface StatusCopy {
  /** Headline shown at the top of the message. */
  title: string
  /** One-line explanation of what this status means. */
  body: string
  /** What the student/consultant should do next. Omitted when there is nothing to do. */
  action?: string
}

const STATUS_COPY: Record<CanonicalStatus, Record<Lang, StatusCopy>> = {
  APPROVED: {
    uz: {
      title: '🎉 VIZA TASDIQLANDI',
      body: 'Tabriklaymiz! Viza arizasi ma\'qullandi.',
      action: 'Vizani PDF ko\'rinishida yuklab oling va pasportdagi ma\'lumotlar bilan solishtiring.'
    },
    en: {
      title: '🎉 VISA APPROVED',
      body: 'Congratulations! The visa application has been approved.',
      action: 'Download the visa PDF and verify the details against the passport.'
    }
  },
  VISA_USED: {
    uz: {
      title: '✅ VIZA ISHLATILDI',
      body: 'Viza kirish uchun ishlatilgan deb belgilandi.',
      action: undefined
    },
    en: {
      title: '✅ VISA USED',
      body: 'The visa has been marked as used for entry.',
      action: undefined
    }
  },
  CANCELLED: {
    uz: {
      title: '❌ ARIZA RAD ETILDI',
      body: 'Afsuski, viza arizasi rad etildi.',
      action: 'Rad etish sababini o\'qing va qayta topshirish imkoniyatini ko\'rib chiqing.'
    },
    en: {
      title: '❌ APPLICATION REJECTED',
      body: 'Unfortunately, the visa application was rejected.',
      action: 'Review the rejection reason and consider re-applying.'
    }
  },
  SUPPLEMENT_NEEDED: {
    uz: {
      title: '⚠️ QO\'SHIMCHA HUJJAT TALAB QILINMOQDA',
      body: 'Elchixona qo\'shimcha hujjatlar so\'radi.',
      action: 'Hujjatlarni imkon qadar tezroq topshiring — kechikish arizani bekor qilishi mumkin.'
    },
    en: {
      title: '⚠️ ADDITIONAL DOCUMENTS REQUIRED',
      body: 'The embassy has requested supplementary documents.',
      action: 'Submit the documents as soon as possible — delays can void the application.'
    }
  },
  SUPPLEMENT_SUBMITTED: {
    uz: {
      title: '📝 QO\'SHIMCHA HUJJAT TOPSHIRILDI',
      body: 'Qo\'shimcha hujjatlar qabul qilindi va ko\'rib chiqilmoqda.',
      action: undefined
    },
    en: {
      title: '📝 SUPPLEMENTARY DOCUMENTS SUBMITTED',
      body: 'The additional documents were received and are under review.',
      action: undefined
    }
  },
  UNDER_REVIEW: {
    uz: {
      title: '🔎 KO\'RIB CHIQILMOQDA',
      body: 'Ariza faol ko\'rib chiqish bosqichiga o\'tdi.',
      action: undefined
    },
    en: {
      title: '🔎 UNDER REVIEW',
      body: 'The application has moved into active review.',
      action: undefined
    }
  },
  RECEIVED: {
    uz: {
      title: '📥 ARIZA QABUL QILINDI',
      body: 'Ariza elchixona tomonidan qabul qilindi.',
      action: undefined
    },
    en: {
      title: '📥 APPLICATION RECEIVED',
      body: 'The application has been received by the embassy.',
      action: undefined
    }
  },
  EXPIRED: {
    uz: {
      title: '⛔ ARIZA MUDDATI TUGADI',
      body: 'Ariza muddati o\'tib ketdi.',
      action: 'Qayta topshirish uchun konsultant bilan bog\'laning.'
    },
    en: {
      title: '⛔ APPLICATION EXPIRED',
      body: 'The application has expired.',
      action: 'Contact the consultant about re-applying.'
    }
  },
  PENDING: {
    uz: {
      title: '🔷 HOLAT YANGILANDI',
      body: 'Ariza holati yangilandi.',
      action: undefined
    },
    en: {
      title: '🔷 STATUS UPDATED',
      body: 'The application status was updated.',
      action: undefined
    }
  },
  UNKNOWN: {
    uz: {
      title: '🔷 HOLAT YANGILANDI',
      body: 'Ariza holati yangilandi.',
      action: undefined
    },
    en: {
      title: '🔷 STATUS UPDATED',
      body: 'The application status was updated.',
      action: undefined
    }
  }
}

/**
 * Statuses that are meaningful enough to announce on their own when they are
 * the FIRST thing we ever learn about a student (no prior notification).
 *
 * Discovering a freshly-added student is already RECEIVED/UNDER REVIEW is
 * baseline data, not news — announcing it spams the consultant every time a
 * batch is imported. A decision (approved / rejected / supplement) always is.
 */
const ANNOUNCE_ON_FIRST_SIGHT: ReadonlySet<CanonicalStatus> = new Set<CanonicalStatus>([
  'APPROVED',
  'VISA_USED',
  'CANCELLED',
  'SUPPLEMENT_NEEDED',
  'SUPPLEMENT_SUBMITTED',
  'EXPIRED'
])

/** Statuses that carry no information — never worth a message. */
const NEVER_ANNOUNCE: ReadonlySet<CanonicalStatus> = new Set<CanonicalStatus>([
  'PENDING',
  'UNKNOWN'
])

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

export interface NotificationResult {
  ok: boolean
  notified?: number
  failed?: number
  skipped?: string
  error?: string
}

/**
 * Decides whether a transition should produce a Telegram message.
 *
 * `lastNotified` is what we last actually sent — NOT the current DB status,
 * which the caller has already overwritten with `next` by this point.
 */
export function shouldNotify(
  lastNotified: unknown,
  next: unknown
): { send: boolean, reason: string } {
  const nextNorm = normalizeStatus(next)

  if (NEVER_ANNOUNCE.has(nextNorm)) {
    return { send: false, reason: `status "${nextNorm}" carries no information` }
  }

  // Already announced this exact state — the single de-duplication gate.
  if (lastNotified && isSameStatus(lastNotified, next)) {
    return { send: false, reason: `already notified for ${nextNorm}` }
  }

  // Nothing announced yet for this student.
  if (!lastNotified) {
    if (ANNOUNCE_ON_FIRST_SIGHT.has(nextNorm)) {
      return { send: true, reason: `first sighting of decisive status ${nextNorm}` }
    }
    return { send: false, reason: `baseline discovery of ${nextNorm} — not a transition` }
  }

  return { send: true, reason: `${normalizeStatus(lastNotified)} → ${nextNorm}` }
}

export async function sendTelegramNotification(
  userId: number,
  payload: TelegramNotificationPayload
): Promise<NotificationResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('[Telegram Notifier] Missing TELEGRAM_BOT_TOKEN. Skipping notification.')
    return { ok: false, skipped: 'Missing token' }
  }

  const db = await getTursoClient()
  const passportKey = String(payload.passport || '').toUpperCase().trim()
  const nextNorm = normalizeStatus(payload.newStatus)

  // ── 1. Verify the student belongs to this cabinet, read lastNotifiedStatus ──
  // NOTE: students.status is deliberately NOT read for the send decision.
  let lastNotifiedStatus: string
  try {
    const studentResult = await db.execute({
      sql: 'SELECT "lastNotifiedStatus", last_notified_status FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
      args: [passportKey, userId]
    })
    if (studentResult.rows.length === 0) {
      return { ok: true, skipped: 'Student not in cabinet' }
    }
    const row = studentResult.rows[0] as Record<string, unknown>
    lastNotifiedStatus = String(row.lastNotifiedStatus || row.last_notified_status || '')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram Notifier] DB verify error:', msg)
    return { ok: false, error: msg }
  }

  // ── 2. Decide ────────────────────────────────────────────────────────────
  const decision = shouldNotify(lastNotifiedStatus, payload.newStatus)
  if (!decision.send) {
    console.log(`[Telegram Notifier] ${passportKey}: no send — ${decision.reason}`)
    // Record non-decisive baseline states so the NEXT real transition is
    // recognised as a change rather than another "first sighting".
    if (!NEVER_ANNOUNCE.has(nextNorm) && !lastNotifiedStatus) {
      await recordNotifiedStatus(db, passportKey, userId, payload.newStatus)
    }
    return { ok: true, skipped: decision.reason }
  }

  console.log(`[Telegram Notifier] ${passportKey}: sending — ${decision.reason}`)

  // ── 3. Look up subscribers ───────────────────────────────────────────────
  interface SubscriberRow { telegram_id: number, lang: string }
  let subscribers: SubscriberRow[]
  try {
    const subsResult = await db.execute({
      sql: `SELECT cs.telegram_id, COALESCE(cs.lang, 'uz') as lang
            FROM cabinet_subscribers cs WHERE cs.cabinet_id = ?`,
      args: [userId]
    })
    subscribers = (subsResult.rows as Record<string, unknown>[])
      .filter(r => r.telegram_id)
      .map(r => ({ telegram_id: Number(r.telegram_id), lang: String(r.lang || 'uz') }))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram Notifier] DB lookup error:', msg)
    return { ok: false, error: msg }
  }

  if (subscribers.length === 0) {
    // No one to tell, but the transition still happened — record it so we do
    // not later replay it as "new" the moment someone connects a Telegram account.
    await recordNotifiedStatus(db, passportKey, userId, payload.newStatus)
    return { ok: true, skipped: 'No subscribers connected' }
  }

  // ── 4. Build message ─────────────────────────────────────────────────────
  const fullName = escapeTelegramText(payload.fullName)
  const passport = escapeTelegramText(passportKey)
  const rawVisaType = payload.visaType || 'Embassy'
  const applicationNo = escapeTelegramText(payload.applicationNo)
  const birthday = escapeTelegramText(payload.birthday)
  const applicationDate = escapeTelegramText(payload.applicationDate)
  const rejectionReason = escapeTelegramText(payload.rejectionReason)
  const previousRejectionReason = escapeTelegramText(payload.previousRejectionReason)
  const invitingCompany = escapeTelegramText(payload.invitingCompany)
  const entryDate = escapeTelegramText(payload.entryDate)

  const residence = cleanVisaTypeCode(payload.statusOfResidence || '')
  const typeClean = cleanVisaTypeCode(rawVisaType)
  let displayVisaType = 'Embassy'
  if (residence) {
    displayVisaType = residence
  } else if (typeClean && !['EMBASSY', 'E-VISA', 'REGIONAL'].includes(typeClean.toUpperCase())) {
    displayVisaType = typeClean
  } else if (rawVisaType) {
    displayVisaType = rawVisaType
  }

  const isEvisaLike = rawVisaType === 'E-Visa' || rawVisaType === 'Regional'
  const isApprovedLike = nextNorm === 'APPROVED' || nextNorm === 'VISA_USED'
  const canDownloadPdf = isApprovedLike && rawVisaType.toLowerCase() !== 'e-visa'
  const nowIso = new Date().toISOString()

  // Show the transition arrow only when we genuinely know the previous state.
  const prevNorm = lastNotifiedStatus ? normalizeStatus(lastNotifiedStatus) : null
  const showTransition = Boolean(prevNorm) && prevNorm !== nextNorm

  function buildMessage(lang: Lang): string {
    const copy = STATUS_COPY[nextNorm][lang]
    const L = {
      visaLbl: lang === 'en' ? '✈️ Visa type:' : '✈️ Visa turi:',
      partner: lang === 'en' ? '🏢 Partner:' : '🏢 Taklif:',
      appNo: lang === 'en' ? '📄 Application No:' : '📄 Ariza raqami:',
      submitted: lang === 'en' ? '📅 Submitted:' : '📅 Topshirilgan:',
      status: lang === 'en' ? '🔄 Status:' : '🔄 Holati:',
      givenDate: lang === 'en' ? '🗓️ Visa issued:' : '🗓️ Viza berilgan:',
      checked: lang === 'en' ? '🕒 Checked:' : '🕒 Tekshirildi:',
      reason: lang === 'en' ? '⚠️ Reason:' : '⚠️ Sababi:',
      prevResult: lang === 'en' ? '🚫 Previous application:' : '🚫 Oldingi ariza:',
      next: lang === 'en' ? '➡️ Next step:' : '➡️ Keyingi qadam:'
    }

    const statusLine = showTransition
      ? `${L.status} ${getStatusEmoji(prevNorm)} ${getDisplayStatus(prevNorm)} → ${getStatusEmoji(nextNorm)} ${getDisplayStatus(nextNorm)}`
      : `${L.status} ${getStatusEmoji(nextNorm)} ${getDisplayStatus(nextNorm)}`

    return [
      copy.title,
      '',
      `👤 ${fullName.toUpperCase()}`,
      `🛂 ${passport.toUpperCase()}`,
      `🎂 ${birthday}`,
      '',
      `${L.visaLbl} ${displayVisaType}`,
      ...(isEvisaLike && invitingCompany ? [`${L.partner} ${invitingCompany}`] : []),
      ...(isEvisaLike && applicationNo ? [`${L.appNo} ${applicationNo}`] : []),
      `${L.submitted} ${applicationDate || 'N/A'}`,
      statusLine,
      ...(isApprovedLike && entryDate && entryDate !== applicationDate ? [`${L.givenDate} ${entryDate}`] : []),
      '',
      copy.body,
      ...(rejectionReason ? ['', `${L.reason} ${rejectionReason}`] : []),
      ...(previousRejectionReason ? [`${L.prevResult} ${previousRejectionReason}`] : []),
      ...(copy.action ? ['', `${L.next} ${copy.action}`] : []),
      '',
      `${L.checked} ${formatLastChecked(nowIso, lang)}`
    ].join('\n')
  }

  function buildMarkup(lang: Lang) {
    const refreshBtn = lang === 'en' ? '🔄 Refresh' : '🔄 Yangilash'
    const pdfBtn = lang === 'en' ? '📥 Visa (pdf)' : '📥 Viza (pdf)'
    const row = [{ text: refreshBtn, callback_data: `check:${passport}` }]
    if (canDownloadPdf) row.push({ text: pdfBtn, callback_data: `download:${passport}` })
    return { inline_keyboard: [row] }
  }

  // ── 5. Send ──────────────────────────────────────────────────────────────
  // parse_mode is intentionally omitted: names and rejection reasons come from
  // an external portal and regularly contain characters (_ * [ ] `) that make
  // Telegram reject a Markdown payload with 400 — which previously dropped the
  // message entirely. Plain text always delivers.
  const results = await Promise.allSettled(
    subscribers.map(({ telegram_id: chatId, lang: subLang }) => {
      const lang: Lang = subLang === 'en' ? 'en' : 'uz'
      return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildMessage(lang),
          reply_markup: buildMarkup(lang),
          disable_web_page_preview: true
        })
      })
        .then(r => r.json())
        .then((res: { ok?: boolean, description?: string }) => {
          if (!res?.ok) {
            console.error(`[Telegram Notifier] Send to ${chatId} rejected by Telegram: ${res?.description || 'unknown error'}`)
          }
          return res
        })
    })
  )

  const succeeded = results.filter(
    r => r.status === 'fulfilled' && (r.value as { ok?: boolean })?.ok
  ).length
  const failed = results.length - succeeded

  // Only record the status as "announced" if at least one subscriber actually
  // received it — otherwise a transient Telegram/network failure would suppress
  // the retry on the next check.
  if (succeeded > 0) {
    await recordNotifiedStatus(db, passportKey, userId, payload.newStatus)
  } else {
    console.error(`[Telegram Notifier] ${passportKey}: all ${results.length} send(s) failed — will retry on next status check`)
  }

  if (failed > 0) {
    console.error(`[Telegram Notifier] ${passportKey}: ${failed}/${results.length} send(s) failed`)
  }

  return { ok: succeeded > 0, notified: succeeded, failed }
}

/** Persists the status we have announced, so it is not announced again. */
async function recordNotifiedStatus(
  db: Awaited<ReturnType<typeof getTursoClient>>,
  passport: string,
  userId: number,
  status: unknown
): Promise<void> {
  try {
    const canonical = toDbStatus(status)
    await db.execute({
      sql: 'UPDATE students SET "lastNotifiedStatus" = ?, last_notified_status = ? WHERE passport = ? AND userId = ? AND deletedAt IS NULL',
      args: [canonical, canonical, passport, userId]
    })
  } catch (err: unknown) {
    console.error(
      '[Telegram Notifier] Failed to update lastNotifiedStatus:',
      err instanceof Error ? err.message : String(err)
    )
  }
}
