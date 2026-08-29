import { Bot, Context } from 'grammy'
import { getTursoClient } from '../../utils/turso'
import { t, type Lang } from '../i18n'
import { settingsKeyboard, languageKeyboard, disconnectConfirmKeyboard } from '../keyboards'
import { resolveUser, clearUserCache } from '../middleware'
import { sendMainMenu } from './start'

/**
 * Handles entry into the settings menu.
 * @param ctx - Grammy context
 */
export async function handleSettings(ctx: Context) {
  if (!ctx.from) return
  try {
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    const isConnected = !!user.consultingId
    const consultingName = user.consultingName

    const msg = t(lang, 'settings')
    await ctx.reply(msg, {
      reply_markup: settingsKeyboard(lang, isConnected, consultingName || undefined)
    })
  } catch (error) {
    console.error('[Bot] Error in handleSettings:', error)
    await ctx.reply('An error occurred. Please try again later.')
  }
}

/**
 * Registers callbacks for settings menu operations.
 * @param bot - Grammy Bot instance
 */
export function registerSettingsHandlers(bot: Bot) {
  bot.callbackQuery('settings:language', async (ctx) => {
    if (!ctx.from) return
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    
    await ctx.editMessageText(t(lang, 'select_language'), {
      reply_markup: languageKeyboard()
    })
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery(/lang:(uz|en)/, async (ctx) => {
    if (!ctx.from) return
    const newLang = ctx.match[1] as Lang
    
    try {
      const db = await getTursoClient()
      await db.execute({
        sql: `INSERT INTO cabinet_subscribers (telegram_id, cabinet_id, lang)
              VALUES (?, COALESCE((SELECT cabinet_id FROM cabinet_subscribers WHERE telegram_id = ?), 0), ?)
              ON CONFLICT(telegram_id) DO UPDATE SET lang = excluded.lang`,
        args: [ctx.from.id, ctx.from.id, newLang]
      })
      
      clearUserCache(ctx.from.id)
      await ctx.answerCallbackQuery(t(newLang, 'language_changed'))
      await ctx.deleteMessage().catch(() => {})
      
      const user = await resolveUser(ctx.from.id)
      const consultingName = user.consultingName
      
      await ctx.reply(t(newLang, 'language_changed'))
      await sendMainMenu(ctx, newLang, consultingName)
      console.log(`[Bot] User ${ctx.from.id} changed language to ${newLang}`)
    } catch (error) {
      console.error('[Bot] Error changing language:', error)
      await ctx.answerCallbackQuery('An error occurred.')
    }
  })

  bot.callbackQuery('settings:disconnect', async (ctx) => {
    if (!ctx.from) return
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    
    await ctx.editMessageText(t(lang, 'disconnect_confirm', { name: user.consultingName || '' }), {
      reply_markup: disconnectConfirmKeyboard(lang)
    })
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('disconnect:yes', async (ctx) => {
    if (!ctx.from) return
    try {
      const userBefore = await resolveUser(ctx.from.id)
      const lang = userBefore.lang

      const db = await getTursoClient()
      await db.execute({
        sql: `DELETE FROM cabinet_subscribers WHERE telegram_id = ?`,
        args: [ctx.from.id]
      })
      
      clearUserCache(ctx.from.id)
      await ctx.answerCallbackQuery()
      await ctx.deleteMessage().catch(() => {})
      
      await ctx.reply(t(lang, 'disconnected'))
      await sendMainMenu(ctx, lang)
      console.log(`[Bot] User ${ctx.from.id} disconnected from consulting`)
    } catch (error) {
      console.error('[Bot] Error during disconnect:', error)
      await ctx.answerCallbackQuery('An error occurred.')
    }
  })

  bot.callbackQuery('disconnect:no', async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.deleteMessage().catch(() => {})
    await handleSettings(ctx)
  })

  bot.callbackQuery('settings:back', async (ctx) => {
    if (!ctx.from) return
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    const consultingName = user.consultingName
    
    await ctx.answerCallbackQuery()
    await ctx.deleteMessage().catch(() => {})
    await sendMainMenu(ctx, lang, consultingName)
  })
}
