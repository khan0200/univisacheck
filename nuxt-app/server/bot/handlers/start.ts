import { Bot, Context } from 'grammy'
import { t, type Lang } from '../i18n'
import { clearState } from '../state'
import { mainMenuKeyboard } from '../keyboards'
import { resolveUser } from '../middleware'
import { handleSettings } from './settings'
import { handleConnect } from './connect'
import { handleVisaCheck } from './visa-check'
import { handleCabinet } from './cabinet'

/**
 * Sends the main menu to the user.
 * 
 * @param ctx - Grammy context
 * @param lang - User language
 * @param consultingName - Connected consulting name, if any
 */
export async function sendMainMenu(ctx: Context, lang: Lang, consultingName?: string | null) {
  const welcomeText = t(lang, 'main_menu')
  await ctx.reply(welcomeText, {
    reply_markup: mainMenuKeyboard(lang, consultingName || undefined)
  })
}

/**
 * Registers the start and main menu routing handlers.
 * 
 * @param bot - The grammy Bot instance
 */
export function registerStartHandlers(bot: Bot) {
  bot.command('start', async (ctx) => {
    if (!ctx.from) return
    
    try {
      const user = await resolveUser(ctx.from.id)
      const lang = user.lang
      const consultingName = user.consultingName
      
      await clearState(ctx.from.id)
      
      const welcomeMsg = t(lang, 'welcome')
      await ctx.reply(welcomeMsg)
      
      await sendMainMenu(ctx, lang, consultingName)
      
      console.log(`[Bot] User ${ctx.from.id} started the bot`)
    } catch (error) {
      console.error('[Bot] Error in /start command:', error)
      await ctx.reply('An error occurred. Please try again later.')
    }
  })

  bot.on('message:text', async (ctx, next) => {
    if (!ctx.from) return next()
    
    const text = ctx.message.text.trim()
    const user = await resolveUser(ctx.from.id)
    const lang = user.lang
    
    const uzVisa = t('uz', 'visa_check')
    const enVisa = t('en', 'visa_check')
    const uzSettings = t('uz', 'settings')
    const enSettings = t('en', 'settings')
    const uzConnect = t('uz', 'connect_consulting')
    const enConnect = t('en', 'connect_consulting')
    const uzCabinetSuffix = t('uz', 'cabinet_suffix')
    const enCabinetSuffix = t('en', 'cabinet_suffix')

    try {
      if (text === uzVisa || text === enVisa) {
        await handleVisaCheck(ctx)
        return
      }
      
      if (text === uzSettings || text === enSettings) {
        await handleSettings(ctx)
        return
      }
      
      if (text === uzConnect || text === enConnect) {
        await handleConnect(ctx)
        return
      }

      if (text.endsWith(uzCabinetSuffix) || text.endsWith(enCabinetSuffix)) {
        if (user.consultingId) {
          await handleCabinet(ctx)
          return
        } else {
          await handleConnect(ctx)
          return
        }
      }
      
      return next()
    } catch (error) {
      console.error('[Bot] Error in main menu routing:', error)
      await ctx.reply(t(lang, 'error_generic'))
    }
  })
}
