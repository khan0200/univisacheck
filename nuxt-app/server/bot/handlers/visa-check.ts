import type { Bot, Context } from 'grammy'
import { InputFile } from 'grammy'
import { getTursoClient } from '../../utils/turso'
import { t, type Lang } from '../i18n'
import { getState, setState, clearState, updateStateData, BotState, type StateData } from '../state'
import { visaTypeKeyboard, refreshResultKeyboard, mainMenuKeyboard, passportConfirmKeyboard } from '../keyboards'
import { resolveUser, checkVisaCheckLimit } from '../middleware'
import { checkStudentVisaStatus, downloadStudentVisaPdf, type VisaStatusInfo } from '../../lib/visa'
import { toDbStatus } from '../../utils/visa-status'

/**
 * Localizes a visa status string to the specified language.
 */
function localizeStatus(lang: Lang, status: string): string {
  const upperStatus = (status || '').toUpperCase().replace(/_/g, ' ').trim()
  if (upperStatus.includes('APPROVED') || upperStatus.includes('ISSUED')) return t(lang, 'status_approved')
  if (upperStatus.includes('VISA USED')) return t(lang, 'status_visa_used')
  if (upperStatus.includes('CANCEL') || upperStatus.includes('REJECT')) return t(lang, 'status_cancelled')
  if (upperStatus.includes('APP/RECEIVED') || upperStatus.includes('RECEIVED')) return t(lang, 'status_received')
  if (upperStatus.includes('SUPPLEMENT SUBMITTED')) return t(lang, 'status_supplement_submitted')
  if (upperStatus.includes('SUPPLEMENT NEEDED') || upperStatus.includes('SUPPLEMENT')) return t(lang, 'status_supplement_needed')
  if (upperStatus.includes('UNDER REVIEW') || upperStatus.includes('REVIEW')) return t(lang, 'status_under_review')
  if (upperStatus === 'PENDING' || upperStatus === 'UNKNOWN' || upperStatus === '') return t(lang, 'status_pending')
  return t(lang, 'status_application')
}

/**
 * Starts the visa check flow.
 */
export async function handleVisaCheck(ctx: Context) {
  if (!ctx.from) return
  const user = await resolveUser(ctx.from.id)
  const lang = user.lang
  await ctx.reply(t(lang, 'select_visa_type'), { reply_markup: visaTypeKeyboard(lang) })
  await setState(ctx.from.id, BotState.SELECTING_VISA_TYPE)
}

/**
 * Internal helper to perform the actual visa check with the portal.
 */
async function performVisaCheck(ctx: Context, lang: Lang, stateData: StateData) {
  if (!ctx.from) return
  const userId = ctx.from.id
  const isAllowed = checkVisaCheckLimit(userId)
  
  if (!isAllowed) {
    await ctx.reply(t(lang, 'rate_limited'))
    return
  }
  
  await setState(userId, BotState.CHECKING_VISA, stateData)
  const checkingMsg = await ctx.reply(t(lang, 'checking_visa'))
  
  try {
    const { passport, fullName, birthday, visaType, applicationNo } = stateData
    if (!passport || !fullName || !birthday || !visaType) {
      throw new Error('Missing required data for visa check')
    }

    const result = await checkStudentVisaStatus(passport, fullName, birthday, visaType, applicationNo || '')
    
    // Save/upsert to bot_manual_refreshes
    const db = await getTursoClient()
    await db.execute({
      sql: `
        INSERT INTO bot_manual_refreshes (passport, fullname, birthday, visa_type, application_no, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(passport) DO UPDATE SET 
          fullname = excluded.fullname, 
          birthday = excluded.birthday,
          visa_type = excluded.visa_type,
          application_no = excluded.application_no,
          updated_at = excluded.updated_at
      `,
      args: [passport, fullName, birthday, visaType, applicationNo || null]
    })

    // Also update students table if this passport exists in any cabinet (Shared truth!)
    const rawNewStatus = result.found ? result.latestStatus : 'Pending'
    const newDbStatus = toDbStatus(rawNewStatus)
    const appDate = result.latestDate || ''
    const nowIso = new Date().toISOString()

    await db.execute({
      sql: `
        UPDATE students
        SET status = ?,
            applicationDate = ?,
            application_date = ?,
            lastChecked = ?,
            last_checked = ?,
            rejectReason = ?,
            pdfUrl = ?,
            apiResponse = ?,
            check_source = 'telegram',
            checkSource = 'telegram'
        WHERE passport = ? AND deletedAt IS NULL
      `,
      args: [
        newDbStatus,
        appDate,
        appDate,
        nowIso,
        nowIso,
        result.rejectionReason || '',
        result.pdfUrl || '',
        JSON.stringify(result),
        passport
      ]
    })

    const isApproved = result.latestStatus.toLowerCase().includes('approved') || 
                       result.latestStatus.toLowerCase().includes('visa used') ||
                       result.latestStatus.toLowerCase().includes('issued')
    
    const { formatStudentCard, getStudentCardKeyboard } = await import('./cabinet')
    const cardText = formatStudentCard(lang, {
      passport,
      fullName,
      birthday,
      visaType,
      statusOfResidence: result.statusOfResidence,
      applicationNo,
      applicationDate: result.latestDate,
      status: result.latestStatus,
      decisionDate: result.entryDate,
      lastChecked: nowIso,
      rejectionReason: result.rejectionReason,
      previousRejectionReason: result.previousRejectionReason,
      pdfUrl: result.pdfUrl
    })

    // Update state data with result for potential download/refresh
    await setState(userId, BotState.SHOWING_RESULT, {
      ...stateData,
      lastResultPassport: passport,
      lastResultData: JSON.stringify(result)
    })

    if (ctx.chat) {
      await ctx.api.deleteMessage(ctx.chat.id, checkingMsg.message_id).catch(() => {})
    }
    const isEVisa = (visaType || '').toLowerCase().includes('e-visa') || (visaType || '').toLowerCase().includes('evisa')
    const hasPdf = !isEVisa && Boolean(result.pdfUrl)
    await ctx.reply(cardText, { reply_markup: getStudentCardKeyboard(lang, passport, isApproved, hasPdf) })
    
  } catch (error: unknown) {
    const errorObj = error as { message?: string }
    console.error('[Bot] performVisaCheck error:', errorObj.message || error)
    if (ctx.chat) {
      await ctx.api.deleteMessage(ctx.chat.id, checkingMsg.message_id).catch(() => {})
    }
    
    const user = await resolveUser(userId)
    if (errorObj.message && errorObj.message.includes('timeout')) {
      await ctx.reply(t(lang, 'portal_timeout'), { reply_markup: mainMenuKeyboard(lang, user.consultingName || undefined) })
    } else {
      await ctx.reply(t(lang, 'portal_error'), { reply_markup: mainMenuKeyboard(lang, user.consultingName || undefined) })
    }
    await clearState(userId)
  }
}

/**
 * Registers all handlers related to visa checking.
 */
export function registerVisaCheckHandlers(bot: Bot) {
  bot.callbackQuery(/^visa_type:(.+)$/, async (ctx) => {
    if (!ctx.from) return
    const userId = ctx.from.id
    const session = await getState(userId)
    
    if (session.state !== BotState.SELECTING_VISA_TYPE) {
      await ctx.answerCallbackQuery()
      return
    }

    const user = await resolveUser(userId)
    const lang = user.lang
    const visaType = ctx.match[1] || 'Embassy'
    
    await setState(userId, BotState.WAITING_PASSPORT, { visaType })
    await ctx.answerCallbackQuery()
    await ctx.reply(t(lang, 'enter_passport'))
  })

  bot.callbackQuery('visa_confirm:check', async (ctx) => {
    if (!ctx.from) return
    const userId = ctx.from.id
    const session = await getState(userId)
    const user = await resolveUser(userId)
    const lang = user.lang
    
    await ctx.answerCallbackQuery()
    await performVisaCheck(ctx, lang, session.data)
  })

  bot.callbackQuery('visa_edit:manual', async (ctx) => {
    if (!ctx.from) return
    const userId = ctx.from.id
    const session = await getState(userId)
    const user = await resolveUser(userId)
    const lang = user.lang
    
    await ctx.answerCallbackQuery()
    await setState(userId, BotState.WAITING_FULLNAME, { ...session.data, fullName: undefined, birthday: undefined })
    await ctx.reply(t(lang, 'enter_fullname'))
  })

  bot.callbackQuery(/^visa_refresh:(.+)$/, async (ctx) => {
    if (!ctx.from) return
    const passport = ctx.match[1] || ''
    const userId = ctx.from.id
    const user = await resolveUser(userId)
    const lang = user.lang

    if (!checkVisaCheckLimit(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: t(lang, 'rate_limited'), show_alert: true })
      return
    }

    // 1. Button loading animation
    await ctx.answerCallbackQuery()

    const oldMessageId = ctx.callbackQuery?.message?.message_id
    const chatId = ctx.chat?.id

    // 2. Send temporary "Checking..." message
    let checkingMsg: { message_id: number } | null = null
    try {
      checkingMsg = await ctx.reply(t(lang, 'checking_visa'))
    } catch {
      // Ignore
    }

    try {
      const db = await getTursoClient()

      let fullName = ''
      let birthday = ''
      let visaType = 'Embassy'
      let applicationNo = ''
      let university = ''

      let studentRow: Record<string, unknown> | null = null

      if (user.consultingId) {
        const studentRes = await db.execute({
          sql: 'SELECT * FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
          args: [passport, user.consultingId]
        })
        if (studentRes.rows.length > 0) {
          studentRow = studentRes.rows[0] as Record<string, unknown>
        }
      }

      if (!studentRow) {
        const studentRes = await db.execute({
          sql: 'SELECT * FROM students WHERE passport = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
          args: [passport]
        })
        if (studentRes.rows.length > 0) {
          studentRow = studentRes.rows[0] as Record<string, unknown>
        }
      }

      if (studentRow) {
        fullName = String(studentRow.fullName || studentRow.fullname || '')
        birthday = String(studentRow.birthday || '')
        visaType = String(studentRow.visaType || studentRow.visa_type || 'Embassy')
        applicationNo = String(studentRow.applicationNo || studentRow.application_no || '')
        university = String(studentRow.university || '')
      } else {
        const refreshRes = await db.execute({
          sql: 'SELECT * FROM bot_manual_refreshes WHERE passport = ? ORDER BY updated_at DESC LIMIT 1',
          args: [passport]
        })
        if (refreshRes.rows.length > 0) {
          const row = refreshRes.rows[0] as Record<string, unknown>
          fullName = String(row.fullname || '')
          birthday = String(row.birthday || '')
          visaType = String(row.visa_type || 'Embassy')
          applicationNo = String(row.application_no || '')
        }
      }

      if (!passport || !fullName || !birthday) {
        if (checkingMsg && chatId) {
          await ctx.api.deleteMessage(chatId, checkingMsg.message_id).catch(() => {})
        }
        await ctx.reply(t(lang, 'session_expired'))
        return
      }

      const result = await checkStudentVisaStatus(passport, fullName, birthday, visaType, applicationNo)

      const rawNewStatus = result.found ? result.latestStatus : 'Pending'
      const newDbStatus = toDbStatus(rawNewStatus)
      const appDate = result.latestDate || ''
      const nowIso = new Date().toISOString()

      // Save to bot_manual_refreshes
      await db.execute({
        sql: `
          INSERT INTO bot_manual_refreshes (passport, fullname, birthday, visa_type, application_no, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(passport) DO UPDATE SET 
            fullname = excluded.fullname, 
            birthday = excluded.birthday,
            visa_type = excluded.visa_type,
            application_no = excluded.application_no,
            updated_at = excluded.updated_at
        `,
        args: [passport, fullName, birthday, visaType, applicationNo || null]
      })

      // Update students table
      await db.execute({
        sql: `
          UPDATE students
          SET status = ?,
              applicationDate = ?,
              application_date = ?,
              lastChecked = ?,
              last_checked = ?,
              rejectReason = ?,
              pdfUrl = ?,
              apiResponse = ?,
              check_source = 'telegram',
              checkSource = 'telegram'
          WHERE passport = ? AND deletedAt IS NULL
        `,
        args: [
          newDbStatus,
          appDate,
          appDate,
          nowIso,
          nowIso,
          result.rejectionReason || '',
          result.pdfUrl || '',
          JSON.stringify(result),
          passport
        ]
      })

      const { formatStudentCard, getStudentCardKeyboard } = await import('./cabinet')
      const isApproved = result.latestStatus.toLowerCase().includes('approved') || 
                         result.latestStatus.toLowerCase().includes('visa used') ||
                         result.latestStatus.toLowerCase().includes('issued')

      const updatedCard = formatStudentCard(lang, {
        passport,
        fullName,
        birthday,
        visaType,
        statusOfResidence: result.statusOfResidence,
        university,
        applicationNo,
        applicationDate: result.latestDate,
        status: result.latestStatus,
        decisionDate: result.entryDate,
        lastChecked: nowIso,
        rejectionReason: result.rejectionReason,
        previousRejectionReason: result.previousRejectionReason,
        pdfUrl: result.pdfUrl
      })

      const isEVisa = (visaType || '').toLowerCase().includes('e-visa') || (visaType || '').toLowerCase().includes('evisa')
      const hasPdf = !isEVisa && Boolean(result.pdfUrl)
      const replyMarkup = getStudentCardKeyboard(lang, passport, isApproved, hasPdf)

      // 3. Delete old message & temporary checking message
      if (oldMessageId && chatId) {
        await ctx.api.deleteMessage(chatId, oldMessageId).catch(() => {})
      }
      if (checkingMsg && chatId) {
        await ctx.api.deleteMessage(chatId, checkingMsg.message_id).catch(() => {})
      }

      // 4. Send updated fresh message at the bottom
      await ctx.reply(updatedCard, { reply_markup: replyMarkup })
    } catch (error) {
      console.error(`[Bot] visa_refresh error for ${passport}:`, error)
      if (checkingMsg && chatId) {
        await ctx.api.deleteMessage(chatId, checkingMsg.message_id).catch(() => {})
      }
      await ctx.reply(t(lang, 'portal_error'))
    }
  })

  bot.callbackQuery(/^visa_download:(.+)$/, async (ctx) => {
    if (!ctx.from) return
    const passport = ctx.match[1] || ''
    const userId = ctx.from.id
    const user = await resolveUser(userId)
    const lang = user.lang
    
    await ctx.answerCallbackQuery()

    const downloadingMsg = await ctx.reply(t(lang, 'downloading_visa'))

    try {
      const db = await getTursoClient()
      let fullName = ''
      let birthday = ''
      let visaType = 'Embassy'
      let applicationNo = ''
      let pdfUrl = ''

      let studentRow: Record<string, unknown> | null = null

      if (user.consultingId) {
        const studentRes = await db.execute({
          sql: 'SELECT * FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
          args: [passport, user.consultingId]
        })
        if (studentRes.rows.length > 0) {
          studentRow = studentRes.rows[0] as Record<string, unknown>
        }
      }

      if (!studentRow) {
        const studentRes = await db.execute({
          sql: 'SELECT * FROM students WHERE passport = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
          args: [passport]
        })
        if (studentRes.rows.length > 0) {
          studentRow = studentRes.rows[0] as Record<string, unknown>
        }
      }

      if (studentRow) {
        fullName = String(studentRow.fullName || studentRow.fullname || '')
        birthday = String(studentRow.birthday || '')
        visaType = String(studentRow.visaType || studentRow.visa_type || 'Embassy')
        applicationNo = String(studentRow.applicationNo || studentRow.application_no || '')
        pdfUrl = String(studentRow.pdfUrl || '')
      } else {
        const refreshRes = await db.execute({
          sql: 'SELECT * FROM bot_manual_refreshes WHERE passport = ? ORDER BY updated_at DESC LIMIT 1',
          args: [passport]
        })
        if (refreshRes.rows.length > 0) {
          const row = refreshRes.rows[0] as Record<string, unknown>
          fullName = String(row.fullname || '')
          birthday = String(row.birthday || '')
          visaType = String(row.visa_type || 'Embassy')
          applicationNo = String(row.application_no || '')
        }
      }

      if (!pdfUrl) {
        const fresh = await checkStudentVisaStatus(passport, fullName, birthday, visaType, applicationNo)
        pdfUrl = fresh.pdfUrl || ''
      }

      if (!pdfUrl) {
        await ctx.reply(t(lang, 'download_error'))
        return
      }

      const { buffer, filename } = await downloadStudentVisaPdf(
        passport,
        fullName || '',
        birthday || '',
        visaType || 'Embassy',
        applicationNo || '',
        pdfUrl
      )

      const captionLines: string[] = [
        '📄 Korea Visa Certificate'
      ]
      if (fullName) {
        captionLines.push(`👤 ${fullName.toUpperCase().trim()}`)
      }
      captionLines.push(`🪪 ${passport.toUpperCase().trim()}`)

      await ctx.replyWithDocument(new InputFile(buffer, filename), {
        caption: captionLines.join('\n')
      })
    } catch (error) {
      console.error('[Bot] visa download error:', error)
      await ctx.reply(t(lang, 'download_error'))
    } finally {
      if (ctx.chat) {
        await ctx.api.deleteMessage(ctx.chat.id, downloadingMsg.message_id).catch(() => {})
      }
    }
  })

  bot.callbackQuery('visa:back', async (ctx) => {
    if (!ctx.from) return
    const userId = ctx.from.id
    const user = await resolveUser(userId)
    const lang = user.lang
    await clearState(userId)
    await ctx.answerCallbackQuery()
    await ctx.reply(t(lang, 'main_menu'), { reply_markup: mainMenuKeyboard(lang, user.consultingName || undefined) })
  })

  // Text handlers for the visa check state machine
  bot.on('message:text', async (ctx, next) => {
    if (!ctx.from) return next()
    const userId = ctx.from.id
    const session = await getState(userId)
    
    if (!session || session.state === BotState.IDLE) {
      return next()
    }

    const { state, data } = session
    const user = await resolveUser(userId)
    const lang = user.lang
    const text = ctx.message.text.trim()

    if (state === BotState.WAITING_PASSPORT) {
      if (!/^[A-Z]{2}\d{7}$/i.test(text)) {
        await ctx.reply(t(lang, 'invalid_passport'))
        return
      }

      const passport = text.toUpperCase()
      const db = await getTursoClient()
      
      // Look up in students table (prioritizing user's consulting)
      let result = user.consultingId
        ? await db.execute({
            sql: 'SELECT passport, fullName, fullname, birthday, visaType, visa_type, applicationNo, application_no FROM students WHERE passport = ? AND userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
            args: [passport, user.consultingId]
          })
        : { rows: [] }

      if (result.rows.length === 0) {
        result = await db.execute({
          sql: 'SELECT passport, fullName, fullname, birthday, visaType, visa_type, applicationNo, application_no FROM students WHERE passport = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
          args: [passport]
        })
      }

      if (result.rows.length === 0) {
        // Look up in bot_manual_refreshes
        result = await db.execute({
          sql: 'SELECT passport, fullname AS fullName, birthday, visa_type AS visaType, application_no AS applicationNo FROM bot_manual_refreshes WHERE passport = ? ORDER BY updated_at DESC LIMIT 1',
          args: [passport]
        })
      }

      const currentData = { ...data, passport }
      await updateStateData(userId, currentData)

      if (result.rows.length > 0) {
        const row = result.rows[0] as Record<string, unknown>
        const fullName = String(row.fullName || row.fullname || '')
        const birthday = String(row.birthday || '')
        const updatedData = { ...currentData, fullName, birthday }
        await updateStateData(userId, updatedData)

        if (data.visaType === 'E-Visa' || data.visaType === 'Regional') {
          await setState(userId, BotState.WAITING_APPLICATION_NO, updatedData)
          const msg = `${t(lang, 'passport_found', { fullName, birthday })}\n\n${t(lang, 'enter_application_no')}`
          await ctx.reply(msg)
        } else {
          await setState(userId, BotState.CONFIRM_PASSPORT_DETAILS, updatedData)
          const msg = `${t(lang, 'passport_found', { fullName, birthday })}\n\n${t(lang, 'confirm_prompt')}`
          await ctx.reply(msg, { reply_markup: passportConfirmKeyboard(lang) })
        }
      } else {
        await ctx.reply(t(lang, 'passport_not_found'))
        await ctx.reply(t(lang, 'enter_fullname'))
        await setState(userId, BotState.WAITING_FULLNAME, currentData)
      }
      return
    }

    if (state === BotState.WAITING_FULLNAME) {
      const fullName = text.toUpperCase()
      const updatedData = { ...data, fullName }
      await updateStateData(userId, updatedData)
      await setState(userId, BotState.WAITING_BIRTHDAY, updatedData)
      await ctx.reply(t(lang, 'enter_birthday'))
      return
    }

    if (state === BotState.WAITING_BIRTHDAY) {
      // Basic normalization
      const dateText = text.replace(/[/.]/g, '-')
      
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        await ctx.reply(t(lang, 'invalid_birthday'))
        return
      }

      const updatedData = { ...data, birthday: dateText }
      await updateStateData(userId, updatedData)

      if (data.visaType === 'E-Visa' || data.visaType === 'Regional') {
        await setState(userId, BotState.WAITING_APPLICATION_NO, updatedData)
        await ctx.reply(t(lang, 'enter_application_no'))
      } else {
        await performVisaCheck(ctx, lang, updatedData)
      }
      return
    }

    if (state === BotState.WAITING_APPLICATION_NO) {
      const updatedData = { ...data, applicationNo: text }
      await updateStateData(userId, updatedData)
      await performVisaCheck(ctx, lang, updatedData)
      return
    }

    await next()
  })
}
