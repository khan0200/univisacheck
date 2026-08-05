import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { H3Event } from 'h3'

// Fails closed if ADMIN_SECRET is unset — no insecure fallback default.
// Used by both /api/visa-calc-leads and the admin /login command in
// /api/ai-assistant, so there is exactly one place this can go wrong.
async function loadLocalConfig(): Promise<{ ADMIN_SECRET?: string }> {
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (!existsSync(configPath)) return {}
    const mod = await import(pathToFileURL(configPath).href)
    return mod.default || mod
  } catch {
    return {}
  }
}

export async function getAdminSecret(): Promise<string> {
  const localConfig = await loadLocalConfig()
  return process.env.ADMIN_SECRET || localConfig.ADMIN_SECRET || ''
}

/** Compares an `Authorization: Bearer <token>` header against ADMIN_SECRET. */
export async function isAdminRequest(event: H3Event): Promise<boolean> {
  const adminSecret = await getAdminSecret()
  if (!adminSecret) return false
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return token === adminSecret
}

/** Throws a Nitro 401 error if the request isn't authorized as admin. */
export async function requireAdmin(event: H3Event): Promise<void> {
  if (!(await isAdminRequest(event))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

/** Compares a raw token string against ADMIN_SECRET (for in-band chat commands like /login <token>). */
export async function isAdminToken(token: string): Promise<boolean> {
  const adminSecret = await getAdminSecret()
  if (!adminSecret) return false
  return token === adminSecret
}
