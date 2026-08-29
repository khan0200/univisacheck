/**
 * server/api/telegram.post.ts
 *
 * Webhook receiver for Telegram Bot API updates.
 * In production, Telegram sends POST requests to this endpoint
 * whenever a user interacts with the bot.
 */

import { getBot, createBot } from '../bot/index'

export default defineEventHandler(async (event) => {
  try {
    let bot = getBot()
    if (!bot) {
      bot = await createBot()
    }

    const body = await readBody(event)
    if (!body) {
      return { ok: true }
    }

    // Process the update asynchronously — don't block the webhook response
    // grammy expects the raw Telegram Update object
    await bot.handleUpdate(body)

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram Webhook] Error processing update:', msg)
    // Always return 200 to Telegram to prevent retry floods
    return { ok: true }
  }
})
