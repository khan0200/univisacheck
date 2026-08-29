/**
 * scripts/test_bot_local.mjs
 *
 * Standalone Local Development & Testing Bot (Long Polling)
 * Uses native fetch — no webhooks, no VPS, no external dependencies required.
 *
 * Usage:
 *   node scripts/test_bot_local.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', 'nuxt-app', '.env')

let token = '8350055588:AAFyGCDJmRRjwFCdrxljhRPISPPME_X2rBY'

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  const match = content.match(/TELEGRAM_BOT_TOKEN=([^\r\n]+)/)
  if (match && match[1]) {
    token = match[1].trim()
  }
}

const API_BASE = `https://api.telegram.org/bot${token}`

async function callTelegram(method, body = null) {
  const url = `${API_BASE}/${method}`
  const options = {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  }
  const res = await fetch(url, options)
  return await res.json()
}

async function sendMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup || undefined
  }
  return callTelegram('sendMessage', payload)
}

async function main() {
  console.log('🤖 Initializing Local Telegram Bot...')
  console.log(`🔑 Token: ${token.slice(0, 10)}...${token.slice(-5)}`)

  // 1. Delete any active webhook so long polling works
  console.log('🧹 Clearing webhook...')
  const delRes = await callTelegram('deleteWebhook', { drop_pending_updates: false })
  if (!delRes.ok) {
    console.warn('⚠️ Warning clearing webhook:', delRes.description)
  }

  // 2. Get bot info
  const meRes = await callTelegram('getMe')
  if (!meRes.ok) {
    console.error('❌ Failed to authenticate bot token:', meRes.description)
    process.exit(1)
  }

  const botInfo = meRes.result
  console.log(`✅ Connected as @${botInfo.username} (${botInfo.first_name}, ID: ${botInfo.id})`)
  console.log('🚀 Long-polling started. Send a message to your bot on Telegram! (Press Ctrl+C to stop)\n')

  let offset = 0

  while (true) {
    try {
      const updatesRes = await callTelegram('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query']
      })

      if (updatesRes.ok && Array.isArray(updatesRes.result)) {
        for (const update of updatesRes.result) {
          offset = update.update_id + 1
          await handleUpdate(update)
        }
      } else if (!updatesRes.ok) {
        console.error('⚠️ Error getting updates:', updatesRes.description)
        await new Promise(r => setTimeout(r, 3000))
      }
    } catch (err) {
      console.error('❌ Polling error:', err.message)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}

async function handleUpdate(update) {
  if (update.message && update.message.text) {
    const msg = update.message
    const chatId = msg.chat.id
    const text = msg.text.trim()
    const from = msg.from ? `${msg.from.first_name || ''} (@${msg.from.username || 'no_username'})` : 'User'

    console.log(`📩 [${from} | Chat ${chatId}]: ${text}`)

    if (text === '/start') {
      const reply = `👋 Salom! Bu lokal test boti (Local Dev Bot).\n\n🤖 Bot holati: Faol (Online)\n🔧 Rejim: Local polling\n\nBuyruqlar:\n/ping - Bot faolligini tekshirish\n/help - Yordam menyusi`
      await sendMessage(chatId, reply, {
        keyboard: [
          [{ text: '🏓 Ping' }, { text: 'ℹ️ Help' }]
        ],
        resize_keyboard: true
      })
      return
    }

    if (text === '/ping' || text === '🏓 Ping') {
      await sendMessage(chatId, `🏓 Pong! Bot lokal ravishda ishlayapti.\n🕒 Vaqt: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Tashkent' })}`)
      return
    }

    if (text === '/help' || text === 'ℹ️ Help') {
      await sendMessage(chatId, `ℹ️ Local Test Bot Qo'llanmasi:\n\nUshbu bot lokal development va test qilish uchun maxsus yaratilgan.`)
      return
    }

    // Echo fallback
    await sendMessage(chatId, `📨 Qabul qilindi: "${text}"\n(Lokal bot sinovi muvaffaqiyatli ishlamoqda)`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
})
