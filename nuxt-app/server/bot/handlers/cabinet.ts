import type { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { getTursoClient } from '../../utils/turso'
import { t, type Lang } from '../i18n'
import { cabinetTabsKeyboard } from '../keyboards'
import { resolveUser } from '../middleware'

export function bucketForStatus(statusValue: string): 'pending' | 'application' | 'cancelled' | 'approved' {
  const status = (statusValue || '').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  const isApproved = status.includes('approved') || status.includes('visa used') || status.includes('issued')
  const isCancelled = status.includes('cancel') || status.includes('reject')
  const isPending = status === 'pending' || status === 'unknown' || status === '' || status.includes('error') || status.includes('not found')
  
  if (isApproved) return 'approved'
  if (isCancelled) return 'cancelled'
  if (isPending) return 'pending'
  return 'application'
}

export function getStatusEmoji(status: string): string {
  const s = (status || '').toUpperCase().replace(/_/g, ' ').trim()
  if (s.includes('APPROV') || s.includes('ISSUED')) return '🟢'
  if (s.includes('UNDER REVIEW') || s.includes('REVIEW') || s.includes('심사중') || s.includes('처리중')) return '🔵'
  if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('불허')) return '🔴'
  if (s.includes('SUPPLEMENT NEEDED') || s.includes('보완요청') || s.includes('보완대기')) return '🟠'
  if (s.includes('SUPPLEMENT SUBMITTED') || s.includes('보완완료') || s.includes('보완제출')) return '🟣'
  if (s.includes('RECEIVED') || s.includes('APP/') || s.includes('접수')) return '🟠'
  if (s.includes('VISA USED') || s.includes('사용완료')) return '🔘'
  return '🔷'
}

export function getCanonicalStatus(status: string): string {
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

export function getStudentResultExplanation(lang: Lang, status: string, isEVisa: boolean = false): string {
  const s = (status || '').toUpperCase().replace(/_/g, ' ').trim()
  if (s.includes('APPROV') || s.includes('ISSUED')) {
    return lang === 'uz' ? 'Tabriklaymiz 🎉' : 'Congratulations 🎉'
  }
  if (s.includes('UNDER REVIEW') || s.includes('REVIEW') || s.includes('심사중') || s.includes('처리중')) {
    return lang === 'uz' ? '⏳ Arizangiz ko\'rib chiqilmoqda.' : '⏳ Your application is being processed.'
  }
  if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('불허')) {
    return lang === 'uz' ? '❌ Viza arizasi rad etilgan.' : '❌ Visa application was rejected.'
  }
  if (s.includes('SUPPLEMENT NEEDED') || s.includes('보완요청') || s.includes('보완대기')) {
    return lang === 'uz' ? '⚠️ Qo\'shimcha hujjat talab etiladi.' : '⚠️ Additional documents are required.'
  }
  if (s.includes('SUPPLEMENT SUBMITTED') || s.includes('보완완료') || s.includes('보완제출')) {
    return lang === 'uz' ? '📝 Qo\'shimcha hujjat topshirildi va ko\'rib chiqilmoqda.' : '📝 Supplement documents submitted and under review.'
  }
  if (s.includes('RECEIVED') || s.includes('APP/') || s.includes('접수')) {
    return lang === 'uz' ? '⏳ Arizangiz qabul qilingan va ko\'rib chiqish kutilmoqda.' : '⏳ Your application is being processed.'
  }
  if (s.includes('VISA USED') || s.includes('사용완료')) {
    return lang === 'uz' ? '✅ Viza allaqachon ishlatilgan.' : '✅ Visa has already been used.'
  }
  return lang === 'uz' ? '⏳ Ariza kutilmoqda.' : '⏳ Your application is being processed.'
}

export function formatStudentCard(
  lang: Lang,
  student: {
    passport: string
    fullName?: string
    birthday?: string
    visaType?: string
    statusOfResidence?: string
    university?: string
    applicationNo?: string
    applicationDate?: string
    status?: string
    lastChecked?: string
    decisionDate?: string
    rejectionReason?: string
    previousRejectionReason?: string
    pdfUrl?: string
  }
): string {
  const lines: string[] = []

  // Header
  lines.push(lang === 'uz' ? '🔍 Viza holatini tekshirish' : '🔍 Visa Status Check')
  lines.push('')

  // Identity
  const fullName = String(student.fullName || 'NO NAME').toUpperCase().trim()
  const passport = String(student.passport || '').toUpperCase().trim()
  const birthday = String(student.birthday || 'N/A').trim()

  lines.push(`👤 ${fullName}`)
  lines.push(`🛂 ${passport}`)
  lines.push(`🎂 ${birthday}`)
  lines.push('')

  // Visa & Application details — prefer status of residence code (e.g. D-2-2) if present
  const rawVisaType = student.statusOfResidence || student.visaType || 'Embassy'
  const isEVisa = String(student.visaType || '').toLowerCase().includes('e-visa') ||
                  String(student.visaType || '').toLowerCase().includes('evisa')

  const visaTypeLabel = lang === 'uz' ? 'Visa turi' : 'Visa type'
  lines.push(`✈️ ${visaTypeLabel}: ${rawVisaType}`)

  if (student.university) {
    lines.push(`🏢 Partner: ${student.university}`)
  }

  if (student.applicationNo) {
    const appNoLabel = lang === 'uz' ? 'Ariza raqami' : 'Application No'
    lines.push(`📄 ${appNoLabel}: ${student.applicationNo}`)
  }

  if (student.applicationDate) {
    const subDateLabel = lang === 'uz' ? 'Topshirilgan sana' : 'Submitted date'
    lines.push(`📅 ${subDateLabel}: ${student.applicationDate}`)
  }

  const rawStatus = String(student.status || 'Pending')
  const statusEmoji = getStatusEmoji(rawStatus)
  const canonicalStatus = getCanonicalStatus(rawStatus)
  const statusLabel = lang === 'uz' ? 'Holati' : 'Status'
  lines.push(`🔄 ${statusLabel}: ${statusEmoji} ${canonicalStatus}`)

  const isApproved = canonicalStatus === 'APPROVED' || canonicalStatus === 'VISA USED'
  if (isApproved && student.decisionDate) {
    const label = lang === 'uz' ? 'Viza berilgan sana' : 'Visa given date'
    lines.push(`🗓 ${label}: ${student.decisionDate}`)
  }

  lines.push('')

  // Timestamp
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
  const checkedLabel = lang === 'uz' ? `🕒 Tekshirildi: Bugun, ${timeStr}` : `🕒 Checked: Today, ${timeStr}`
  lines.push(checkedLabel)
  lines.push('')

  // Result explanation
  const resultPrefix = lang === 'uz' ? 'Natija' : 'Result'
  if (isApproved) {
    lines.push(`${resultPrefix}: ${lang === 'uz' ? 'Tabriklaymiz 🎉' : 'Congratulations 🎉'}`)
  } else {
    const explanation = getStudentResultExplanation(lang, rawStatus, isEVisa)
    lines.push(`${resultPrefix}: ${explanation}`)
  }

  // Current rejection reason if status is cancelled/rejected
  if ((canonicalStatus === 'REJECTED' || canonicalStatus === 'CANCELLED') && student.rejectionReason) {
    lines.push('')
    lines.push(`${lang === 'uz' ? '🚫 Sababi' : '🚫 Reason'}: ${student.rejectionReason}`)
  }

  // Previous rejection reason if student had a prior rejection on visa.go.kr
  if (student.previousRejectionReason) {
    lines.push('')
    lines.push(lang === 'uz' ? 'Oldingi ariza natijasi:' : 'Previous application result:')
    lines.push(`${lang === 'uz' ? '🚫 Sababi' : '🚫 Reason'}: ${student.previousRejectionReason}`)
  }

  return lines.join('\n')
}

export function getStudentCardKeyboard(lang: Lang, passport: string, isApproved: boolean, hasPdf: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
  kb.text(lang === 'uz' ? '🔄 Yangilash' : '🔄 Refresh', `visa_refresh:${passport}`)
  if (isApproved && hasPdf) {
    kb.row().text(lang === 'uz' ? '📥 Viza (pdf)' : '📥 Visa (pdf)', `visa_download:${passport}`)
  }
  return kb
}

/**
 * Handles entry into the cabinet.
 */
export async function handleCabinet(ctx: Context) {
  if (!ctx.from) return
  const user = await resolveUser(ctx.from.id)
  const lang = user.lang
  
  if (!user.consultingId) {
    await ctx.reply(t(lang, 'not_connected_error'))
    return
  }

  const db = await getTursoClient()
  const result = await db.execute({
    sql: 'SELECT status, COUNT(*) as count FROM students WHERE userId = ? AND deletedAt IS NULL GROUP BY status',
    args: [user.consultingId]
  })

  const counts = {
    pending: 0,
    application: 0,
    cancelled: 0,
    approved: 0
  }

  for (const row of result.rows) {
    const r = row as Record<string, unknown>
    const bucket = bucketForStatus(String(r.status || ''))
    counts[bucket] += Number(r.count || 0)
  }

  const title = t(lang, 'cabinet_title', { name: user.consultingName || 'Consulting' })
  await ctx.reply(`📊 ${title}`, {
    reply_markup: cabinetTabsKeyboard(lang, counts)
  })
}

async function handleTabSelect(ctx: Context, tab: 'pending' | 'application' | 'cancelled' | 'approved', pageStr: string) {
  if (!ctx.from) return
  const user = await resolveUser(ctx.from.id)
  const lang = user.lang
  
  if (!user.consultingId) {
    await ctx.answerCallbackQuery({ text: t(lang, 'not_connected_error'), show_alert: true })
    return
  }

  const page = parseInt(pageStr, 10) || 0
  const pageSize = 5

  const db = await getTursoClient()
  const result = await db.execute({
    sql: 'SELECT passport, fullName, fullname, birthday, status, applicationDate, application_date, visaType, visa_type, applicationNo, application_no, university, pdfUrl, rejectReason, apiResponse FROM students WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC',
    args: [user.consultingId]
  })

  // Filter by bucket
  const filteredStudents = (result.rows as Record<string, unknown>[]).filter(
    row => bucketForStatus(String(row.status || '')) === tab
  )
  const totalCount = filteredStudents.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  
  const validPage = Math.min(Math.max(page, 0), totalPages - 1)
  const startIdx = validPage * pageSize
  const pagedStudents = filteredStudents.slice(startIdx, startIdx + pageSize)

  const tabLabels: Record<string, string> = {
    pending: lang === 'uz' ? '⏳ Kutilmoqda' : '⏳ Pending',
    application: lang === 'uz' ? '📋 Arizalar' : '📋 Application',
    cancelled: lang === 'uz' ? '❌ Bekor qilingan' : '❌ Cancelled',
    approved: lang === 'uz' ? '✅ Tasdiqlangan' : '✅ Approved'
  }

  await ctx.answerCallbackQuery()

  if (pagedStudents.length === 0) {
    const emptyKeyboard = new InlineKeyboard().text(t(lang, 'back'), 'cab:back')
    await ctx.reply(`📂 ${tabLabels[tab] || tab} (0)\n\n${t(lang, 'no_students')}`, {
      reply_markup: emptyKeyboard
    })
    return
  }

  // Send each student as an individual message with its own refresh button
  for (const student of pagedStudents) {
    const rawStatus = String(student.status || 'Pending')
    const visaType = String(student.visaType || student.visa_type || 'Embassy')
    const isEVisa = visaType.toLowerCase().includes('e-visa') || visaType.toLowerCase().includes('evisa')
    const isApproved = rawStatus.toLowerCase().includes('approved') || rawStatus.toLowerCase().includes('visa used')
    const hasPdf = !isEVisa && Boolean(student.pdfUrl)
    const passport = String(student.passport || '')

    let decisionDate = ''
    let previousRejectionReason = ''
    let statusOfResidence = ''
    if (student.apiResponse) {
      try {
        const parsed = typeof student.apiResponse === 'string' ? JSON.parse(student.apiResponse as string) : student.apiResponse
        decisionDate = parsed.entryDate || parsed.decisionDate || ''
        statusOfResidence = parsed.statusOfResidence || ''
        previousRejectionReason = parsed.previousRejectionReason || ''
        if (!previousRejectionReason && parsed.records && parsed.records.length > 1) {
          for (let i = 1; i < parsed.records.length; i++) {
            if (parsed.records[i]?.rejectionReason) {
              previousRejectionReason = parsed.records[i].rejectionReason
              break
            }
          }
        }
      } catch {}
    }

    const cardText = formatStudentCard(lang, {
      passport,
      fullName: String(student.fullName || student.fullname || ''),
      birthday: String(student.birthday || ''),
      visaType,
      statusOfResidence,
      university: String(student.university || ''),
      applicationNo: String(student.applicationNo || student.application_no || ''),
      applicationDate: String(student.applicationDate || student.application_date || ''),
      status: rawStatus,
      decisionDate,
      rejectionReason: String(student.rejectReason || student.rejectionReason || ''),
      previousRejectionReason,
      pdfUrl: String(student.pdfUrl || '')
    })

    const keyboard = getStudentCardKeyboard(lang, passport, isApproved, hasPdf)
    await ctx.reply(cardText, { reply_markup: keyboard })
  }

  // Send navigation controls
  const navKeyboard = new InlineKeyboard()
  if (validPage > 0) {
    navKeyboard.text(t(lang, 'previous'), `cab:${tab}:${validPage - 1}`)
  }
  if (totalPages > 1) {
    navKeyboard.text(t(lang, 'page_info', { page: String(validPage + 1), total: String(totalPages) }), 'noop')
  }
  if (validPage < totalPages - 1) {
    navKeyboard.text(t(lang, 'next'), `cab:${tab}:${validPage + 1}`)
  }
  navKeyboard.row()
  navKeyboard.text(t(lang, 'back'), 'cab:back')

  const summaryText = `📂 ${tabLabels[tab] || tab} (${totalCount}) — ${lang === 'uz' ? 'Sahifa' : 'Page'} ${validPage + 1}/${totalPages}`
  await ctx.reply(summaryText, { reply_markup: navKeyboard })
}

/**
 * Registers cabinet handlers.
 */
export function registerCabinetHandlers(bot: Bot) {
  bot.callbackQuery(/^cab:(pending|application|cancelled|approved):(\d+)$/, async (ctx) => {
    const tab = (ctx.match[1] || 'pending') as 'pending' | 'application' | 'cancelled' | 'approved'
    const page = ctx.match[2] || '0'
    await handleTabSelect(ctx, tab, page)
  })

  bot.callbackQuery('cab:refresh', async (ctx) => {
    if (!ctx.from) return
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    if (!user.consultingId) {
      await ctx.answerCallbackQuery({ text: t(lang, 'not_connected_error'), show_alert: true })
      return
    }

    const db = await getTursoClient()
    const result = await db.execute({
      sql: 'SELECT status, COUNT(*) as count FROM students WHERE userId = ? AND deletedAt IS NULL GROUP BY status',
      args: [user.consultingId]
    })

    const counts = { pending: 0, application: 0, cancelled: 0, approved: 0 }
    for (const row of result.rows) {
      const r = row as Record<string, unknown>
      const bucket = bucketForStatus(String(r.status || ''))
      counts[bucket] += Number(r.count || 0)
    }

    await ctx.answerCallbackQuery(t(lang, 'refresh'))
    
    const title = t(lang, 'cabinet_title', { name: user.consultingName || 'Consulting' })
    try {
      await ctx.editMessageText(`📊 ${title}`, {
        reply_markup: cabinetTabsKeyboard(lang, counts)
      })
    } catch {
      await ctx.reply(`📊 ${title}`, {
        reply_markup: cabinetTabsKeyboard(lang, counts)
      })
    }
  })

  bot.callbackQuery('cab:back', async (ctx) => {
    if (!ctx.from) return
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    
    if (!user.consultingId) {
      await ctx.answerCallbackQuery({ text: t(lang, 'not_connected_error'), show_alert: true })
      return
    }

    const db = await getTursoClient()
    const result = await db.execute({
      sql: 'SELECT status, COUNT(*) as count FROM students WHERE userId = ? AND deletedAt IS NULL GROUP BY status',
      args: [user.consultingId]
    })

    const counts = { pending: 0, application: 0, cancelled: 0, approved: 0 }
    for (const row of result.rows) {
      const r = row as Record<string, unknown>
      const bucket = bucketForStatus(String(r.status || ''))
      counts[bucket] += Number(r.count || 0)
    }

    await ctx.answerCallbackQuery()
    
    const title = t(lang, 'cabinet_title', { name: user.consultingName || 'Consulting' })
    await ctx.reply(`📊 ${title}`, {
      reply_markup: cabinetTabsKeyboard(lang, counts)
    })
  })
}
