import { Bot, Context } from 'grammy'
import { getTursoClient } from '../../utils/turso'
import { t, type Lang } from '../i18n'
import { getState, setState, clearState, BotState } from '../state'
import { resolveUser, clearUserCache } from '../middleware'
import { sendMainMenu } from './start'
import bcrypt from 'bcryptjs'

/**
 * Handles entry into the consulting connect flow.
 * @param ctx - Grammy context
 */
export async function handleConnect(ctx: Context) {
  if (!ctx.from) return
  try {
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    
    if (user.consultingId) {
      const msg = t(lang, 'already_connected', { name: user.consultingName || '' })
      await ctx.reply(msg)
      return
    }

    await setState(ctx.from.id, BotState.WAITING_CONSULTING_EMAIL, {})
    
    const promptMsg = t(lang, 'enter_email_or_name')
    await ctx.reply(promptMsg)
  } catch (error) {
    console.error('[Bot] Error in handleConnect:', error)
    await ctx.reply('An error occurred. Please try again later.')
  }
}

/**
 * Registers handlers for the consulting connection flow.
 * @param bot - Grammy Bot instance
 */
export function registerConnectHandlers(bot: Bot) {
  bot.on('message:text', async (ctx, next) => {
    if (!ctx.from) return next()
    
    const session = await getState(ctx.from.id)
    if (!session || (session.state !== BotState.WAITING_CONSULTING_EMAIL && session.state !== BotState.WAITING_CONSULTING_PASSWORD)) {
      return next()
    }

    const text = ctx.message.text.trim()
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang

    try {
      if (session.state === BotState.WAITING_CONSULTING_EMAIL) {
        await setState(ctx.from.id, BotState.WAITING_CONSULTING_PASSWORD, { consultingEmail: text })
        const passMsg = t(lang, 'enter_password')
        await ctx.reply(passMsg)
        return
      }

      if (session.state === BotState.WAITING_CONSULTING_PASSWORD) {
        const consultingEmail = session.data?.consultingEmail
        if (!consultingEmail) {
          await clearState(ctx.from.id)
          await ctx.reply(t(lang, 'session_expired'))
          await sendMainMenu(ctx, lang)
          return
        }

        const password = text
        const db = await getTursoClient()
        
        const result = await db.execute({
          sql: `SELECT id, email, username, password FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)`,
          args: [consultingEmail, consultingEmail]
        })

        if (result.rows.length === 0) {
          await clearState(ctx.from.id)
          await ctx.reply(t(lang, 'consulting_not_found'))
          await sendMainMenu(ctx, lang)
          return
        }

        const consultingRow = result.rows[0] as Record<string, unknown>
        const dbPassword = String(consultingRow.password || '')
        
        const isValid = await bcrypt.compare(password, dbPassword)
        
        if (!isValid) {
          await clearState(ctx.from.id)
          await ctx.reply(t(lang, 'wrong_credentials'))
          await sendMainMenu(ctx, lang)
          return
        }

        const cabinetId = Number(consultingRow.id)
        const consultingName = String(consultingRow.username || '')

        await db.execute({
          sql: `INSERT INTO cabinet_subscribers (telegram_id, cabinet_id, telegram_username, first_name, last_name, lang, connected_at) 
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(telegram_id) DO UPDATE SET
                  cabinet_id = excluded.cabinet_id,
                  telegram_username = excluded.telegram_username,
                  first_name = excluded.first_name,
                  last_name = excluded.last_name,
                  connected_at = excluded.connected_at`,
          args: [
            ctx.from.id, 
            cabinetId, 
            ctx.from.username || null, 
            ctx.from.first_name || null, 
            ctx.from.last_name || null, 
            lang
          ]
        })

        await clearState(ctx.from.id)
        clearUserCache(ctx.from.id)
        
        const successMsg = t(lang, 'connected_success', { name: consultingName })
        await ctx.reply(successMsg)
        
        await sendMainMenu(ctx, lang, consultingName)
        console.log(`[Bot] User ${ctx.from.id} successfully connected to consulting ${cabinetId} (${consultingName})`)
        return
      }
    } catch (error) {
      console.error('[Bot] Error in connect flow:', error)
      await clearState(ctx.from.id)
      await ctx.reply(t(lang, 'error_generic'))
      await sendMainMenu(ctx, lang)
      return
    }

    return next()
  })
}
