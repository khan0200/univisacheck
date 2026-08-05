// @ts-nocheck
import { webhookCallback } from 'grammy'
import bot from '../lib/telegram'
import { initDb } from '../lib/turso'

// Track database schema-migration initialization across warm invocations —
// only needs to run once per server lifetime, not per-request.
let dbInitialized = false

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDb()
    dbInitialized = true
  }
}

// grammY's std/http adapter speaks plain Web Request -> Web Response, which
// h3's toWebRequest()/sendWebResponse() bridge natively — this avoids the
// legacy Vercel version's 'next-js' adapter (raw Node req/res), which isn't
// compatible with Nitro's H3Event.
const handler = webhookCallback(bot, 'std/http')

export default defineEventHandler(async (event) => {
  try {
    await ensureDbInitialized()
    const request = toWebRequest(event)
    const response = await handler(request)
    await sendWebResponse(event, response)
  } catch (err: any) {
    console.error('[Telegram Webhook Error]:', err.message)
    // Respond 200 to Telegram to prevent it from spam-retrying a failed update.
    setResponseStatus(event, 200)
    return { ok: false, error: err.message }
  }
})
