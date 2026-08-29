/**
 * server/bot/index.ts
 *
 * Telegram bot initialization and handler registration.
 * Creates the grammy Bot instance, registers all middleware and handlers,
 * and exports start/stop functions for the Nitro plugin.
 */

import { Bot } from 'grammy'
import { setBotApi } from './services/notifier'

// Handler registrations are imported lazily to avoid circular deps
let botInstance: Bot | null = null
let isRunning = false

/**
 * Returns the bot token from environment.
 */
function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('[Bot] TELEGRAM_BOT_TOKEN environment variable is not set')
  }
  return token
}

/**
 * Creates and configures the bot instance with all handlers.
 */
export async function createBot(): Promise<Bot> {
  if (botInstance) return botInstance

  const token = getBotToken()
  const bot = new Bot(token)
  await bot.init()

  // Register error handler
  bot.catch(async (err) => {
    const { errorBoundary } = await import('./middleware')
    await errorBoundary(err.error as Error, err.ctx)
  })

  // Register rate limiting middleware
  const { rateLimitMiddleware } = await import('./middleware')
  bot.use(rateLimitMiddleware)

  // Register handlers in order
  const { registerStartHandlers } = await import('./handlers/start')
  const { registerSettingsHandlers } = await import('./handlers/settings')
  const { registerConnectHandlers } = await import('./handlers/connect')
  const { registerVisaCheckHandlers } = await import('./handlers/visa-check')
  const { registerCabinetHandlers } = await import('./handlers/cabinet')

  registerStartHandlers(bot)
  registerSettingsHandlers(bot)
  registerConnectHandlers(bot)
  registerVisaCheckHandlers(bot)
  registerCabinetHandlers(bot)

  // Wire up the notifier with the bot's API
  setBotApi({
    sendMessage: async (chatId: number, text: string, options?: Record<string, unknown>) => {
      return await bot.api.sendMessage(chatId, text, options as Parameters<typeof bot.api.sendMessage>[2])
    }
  })

  botInstance = bot
  console.log('[Bot] Bot instance created and handlers registered')
  return bot
}

/**
 * Starts the bot in long-polling mode (for local development).
 * Deletes any active webhook first.
 */
export async function startPolling(): Promise<void> {
  if (isRunning) {
    console.log('[Bot] Already running, skipping startPolling')
    return
  }

  const bot = await createBot()

  try {
    // Delete webhook so long-polling works
    await bot.api.deleteWebhook({ drop_pending_updates: false })
    console.log('[Bot] Webhook cleared for long-polling mode')

    const me = await bot.api.getMe()
    console.log(`[Bot] Connected as @${me.username} (${me.first_name}, ID: ${me.id})`)

    // Start polling
    bot.start({
      onStart: () => {
        isRunning = true
        console.log('[Bot] Long-polling started successfully')
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Bot] Failed to start polling:', msg)
  }
}

/**
 * Stops the bot gracefully.
 */
export async function stopBot(): Promise<void> {
  if (botInstance && isRunning) {
    try {
      botInstance.stop()
      isRunning = false
      console.log('[Bot] Stopped gracefully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Bot] Error during stop:', msg)
    }
  }
}

/**
 * Returns the bot instance (for webhook handler).
 */
export function getBot(): Bot | null {
  return botInstance
}
