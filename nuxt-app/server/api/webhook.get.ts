/**
 * server/api/webhook.get.ts
 *
 * Utility endpoint to register the Telegram webhook URL.
 * Protected by ADMIN_SECRET. Usage:
 *   GET /api/webhook?secret=YOUR_ADMIN_SECRET&url=https://yourdomain.com/api/telegram
 */

import { getBot, createBot } from '../bot/index'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const secret = query.secret as string
  const webhookUrl = query.url as string

  // Validate admin secret
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || secret !== adminSecret) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  if (!webhookUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing url parameter' })
  }

  try {
    let bot = getBot()
    if (!bot) {
      bot = await createBot()
    }

    await bot.api.setWebhook(webhookUrl, {
      drop_pending_updates: false,
      allowed_updates: ['message', 'callback_query']
    })

    const info = await bot.api.getWebhookInfo()

    return {
      success: true,
      webhook: {
        url: info.url,
        has_custom_certificate: info.has_custom_certificate,
        pending_update_count: info.pending_update_count,
        max_connections: info.max_connections
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Webhook] Failed to set webhook:', msg)
    throw createError({ statusCode: 500, statusMessage: `Failed to set webhook: ${msg}` })
  }
})
