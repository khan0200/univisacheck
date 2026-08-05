/**
 * server/api/webhook.get.ts
 *
 * Helper to register or delete the Telegram bot webhook. Ported from the
 * legacy api/webhook.ts — axios replaced with native fetch (axios's CJS
 * default-export shape doesn't interop reliably through Nitro's bundler,
 * same issue hit while porting lib/ai/*.js).
 *
 * Usage:
 *   GET /api/webhook             -> registers webhook for this domain
 *   GET /api/webhook?action=delete -> deletes the current webhook
 */
import { apiError } from '../utils/api-error'

export default defineEventHandler(async (event) => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) apiError(500, 'Missing TELEGRAM_BOT_TOKEN environment variable.')

  const headers = getHeaders(event)
  const host = headers['x-forwarded-host'] || headers.host || ''
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https'
  const webhookUrl = `${protocol}://${host}/api/telegram`

  const query = getQuery(event)
  const action = query.action || 'set'

  try {
    if (action === 'delete') {
      console.log('[Webhook Setup] Deleting webhook...')
      const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: 'POST' })
      const details = await response.json()
      return {
        success: true,
        message: 'Telegram webhook removed successfully.',
        details
      }
    }

    console.log(`[Webhook Setup] Registering webhook url to: ${webhookUrl}`)
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      })
    })
    const details = await response.json()

    return {
      success: true,
      message: `Telegram webhook set successfully to: ${webhookUrl}`,
      details
    }
  } catch (err: any) {
    console.error('[Webhook Setup Error]:', err.message)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: 'Failed to manage Telegram webhook configuration.',
      details: err.message
    }
  }
})
