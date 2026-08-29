import type { Context, NextFunction } from 'grammy'
import { getTursoClient } from '../utils/turso'
import { t, type Lang } from './i18n'

// Rate Limiter implementation
const BUCKET_CAPACITY = 20
const REFILL_RATE_MS = 3000

interface TokenBucket {
  tokens: number
  lastRefill: number
}

const rateLimitMap = new Map<number, TokenBucket>()
const visaCheckMap = new Map<number, number[]>()

/**
 * Check general rate limit
 */
export function checkRateLimit(telegramId: number): boolean {
  const now = Date.now()
  let bucket = rateLimitMap.get(telegramId)

  if (!bucket) {
    bucket = { tokens: BUCKET_CAPACITY, lastRefill: now }
    rateLimitMap.set(telegramId, bucket)
  }

  const timePassed = now - bucket.lastRefill
  const tokensToAdd = Math.floor(timePassed / REFILL_RATE_MS)

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }

  return false
}

/**
 * Check specific visa check rate limit (max 5 requests per minute)
 */
export function checkVisaCheckLimit(telegramId: number): boolean {
  const now = Date.now()
  const limitWindowMs = 60 * 1000 // 1 minute
  const maxRequests = 5

  let timestamps = visaCheckMap.get(telegramId) || []
  
  // Filter out old timestamps
  timestamps = timestamps.filter(ts => now - ts < limitWindowMs)
  
  if (timestamps.length >= maxRequests) {
    visaCheckMap.set(telegramId, timestamps)
    return false
  }

  timestamps.push(now)
  visaCheckMap.set(telegramId, timestamps)
  return true
}

/**
 * Rate limit middleware for grammy
 */
export async function rateLimitMiddleware(ctx: Context, next: NextFunction) {
  const telegramId = ctx.from?.id
  if (telegramId) {
    if (!checkRateLimit(telegramId)) {
      const user = await resolveUser(telegramId)
      await ctx.reply(t(user.lang, 'rate_limited'))
      return
    }
  }
  await next()
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [id, bucket] of rateLimitMap.entries()) {
    if (now - bucket.lastRefill > 5 * 60 * 1000 && bucket.tokens === BUCKET_CAPACITY) {
      rateLimitMap.delete(id)
    }
  }
  for (const [id, timestamps] of visaCheckMap.entries()) {
    const valid = timestamps.filter(ts => now - ts < 60 * 1000)
    if (valid.length === 0) {
      visaCheckMap.delete(id)
    } else {
      visaCheckMap.set(id, valid)
    }
  }
}, 5 * 60 * 1000)

/**
 * Error boundary for unexpected exceptions
 */
export async function errorBoundary(err: Error, ctx: Context) {
  const telegramId = ctx.from?.id || 'unknown'
  const messageText = ctx.message?.text || ctx.callbackQuery?.data || 'unknown'
  
  console.error(`[Bot Error] User: ${telegramId}, Action: ${messageText}, Error:`, err.message)
  
  try {
    if (ctx.from?.id) {
      const user = await resolveUser(ctx.from.id)
      await ctx.reply(t(user.lang, 'error_generic'))
    }
  } catch (replyErr) {
    console.error(`[Bot Error] Failed to send error message:`, replyErr)
  }
}

export interface BotUser {
  telegramId: number
  lang: Lang
  consultingId: number | null
  consultingName: string | null
}

interface CacheEntry {
  user: BotUser
  expiresAt: number
}

const userCache = new Map<number, CacheEntry>()

/**
 * Invalidate user cache
 */
export function clearUserCache(telegramId?: number) {
  if (telegramId) {
    userCache.delete(telegramId)
  } else {
    userCache.clear()
  }
}

/**
 * Resolves user from database with caching
 */
export async function resolveUser(telegramId: number): Promise<BotUser> {
  const now = Date.now()
  const cached = userCache.get(telegramId)
  
  if (cached && cached.expiresAt > now) {
    return cached.user
  }

  try {
    const client = await getTursoClient()
    const result = await client.execute({
      sql: `
        SELECT 
          cs.lang,
          cs.cabinet_id,
          u.username as consulting_name
        FROM cabinet_subscribers cs
        LEFT JOIN users u ON cs.cabinet_id = u.id
        WHERE cs.telegram_id = ?
      `,
      args: [telegramId]
    })

    const row = result.rows[0] as Record<string, unknown> | undefined
    const rawCabinetId = row?.cabinet_id ? Number(row.cabinet_id) : 0
    
    const user: BotUser = {
      telegramId,
      lang: (row?.lang as Lang) || 'uz',
      consultingId: rawCabinetId > 0 ? rawCabinetId : null,
      consultingName: rawCabinetId > 0 && row?.consulting_name ? String(row.consulting_name) : null
    }

    userCache.set(telegramId, {
      user,
      expiresAt: now + 60 * 1000 // 60 seconds cache
    })

    return user
  } catch (error) {
    console.error(`[Bot] Error resolving user ${telegramId}:`, error)
    return {
      telegramId,
      lang: 'uz',
      consultingId: null,
      consultingName: null
    }
  }
}
