/**
 * server/plugins/telegram-bot.ts
 *
 * Nitro server plugin that initializes the Telegram bot on server startup.
 * In development: starts long-polling mode.
 * In production: bot is initialized but waits for webhook updates via /api/telegram.
 */

import { startPolling, createBot, stopBot } from '../bot/index'

export default defineNitroPlugin(async (nitroApp) => {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    console.warn('[Bot Plugin] TELEGRAM_BOT_TOKEN not set, Telegram bot will not start')
    return
  }

  const isDev = import.meta.dev || process.env.NODE_ENV !== 'production'

  try {
    if (isDev) {
      // Development: use long-polling (no webhook needed)
      console.log('[Bot Plugin] Starting Telegram bot in long-polling mode (development)...')
      startPolling().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Bot Plugin] Failed to start polling:', msg)
      })
    } else {
      // Production: initialize bot and ensure webhook is registered
      console.log('[Bot Plugin] Initializing Telegram bot for webhook mode (production)...')
      const bot = await createBot()

      const webhookDomain = process.env.BASE_URL || process.env.APP_URL || 'https://salomkorea.uz'
      const targetWebhookUrl = `${webhookDomain.replace(/\/+$/, '')}/api/telegram`

      try {
        const info = await bot.api.getWebhookInfo()
        if (info.url !== targetWebhookUrl) {
          console.log(`[Bot Plugin] Registering webhook URL: ${targetWebhookUrl} (was: "${info.url}")`)
          await bot.api.setWebhook(targetWebhookUrl, {
            drop_pending_updates: false,
            allowed_updates: ['message', 'callback_query']
          })
          console.log('[Bot Plugin] Telegram webhook registered successfully')
        } else {
          console.log('[Bot Plugin] Telegram webhook already properly set to:', info.url)
        }
      } catch (webhookErr) {
        const msg = webhookErr instanceof Error ? webhookErr.message : String(webhookErr)
        console.error('[Bot Plugin] Failed to verify/set webhook:', msg)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Bot Plugin] Initialization error:', msg)
  }

  // Graceful shutdown
  nitroApp.hooks.hook('close', async () => {
    console.log('[Bot Plugin] Server closing, stopping bot...')
    await stopBot()
  })
})
