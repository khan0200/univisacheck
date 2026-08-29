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

  const isDev = process.dev || process.env.NODE_ENV !== 'production'

  try {
    if (isDev) {
      // Development: use long-polling (no webhook needed)
      console.log('[Bot Plugin] Starting Telegram bot in long-polling mode (development)...')
      startPolling().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Bot Plugin] Failed to start polling:', msg)
      })
    } else {
      // Production: just create the bot (webhook endpoint handles updates)
      console.log('[Bot Plugin] Initializing Telegram bot for webhook mode (production)...')
      await createBot()
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
