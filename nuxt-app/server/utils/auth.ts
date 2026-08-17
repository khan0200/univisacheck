import jwt from 'jsonwebtoken'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { H3Event } from 'h3'

export interface AuthUser {
  userId: number
  email: string
  username: string
}

// Credentials come from environment variables in production (Vercel: JWT_SECRET).
// For local dev, fall back to the repo-root turso.config.js (gitignored) —
// same pattern as server/utils/turso.ts, so no secret is duplicated here.
async function loadLocalConfig(): Promise<{ JWT_SECRET?: string }> {
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (!existsSync(configPath)) return {}
    const mod = await import(pathToFileURL(configPath).href)
    return mod.default || mod
  } catch {
    return {}
  }
}

let jwtSecret: string | null = null

export async function getJwtSecret(): Promise<string> {
  if (jwtSecret) return jwtSecret

  const localConfig = await loadLocalConfig()
  const secret = process.env.JWT_SECRET || localConfig.JWT_SECRET || 'visacheck-secret-key-2026-change-in-production'

  jwtSecret = secret
  return jwtSecret
}

const JWT_EXPIRES = '7d'

export async function signToken(user: { id: number, email: string, username: string }): Promise<string> {
  const secret = await getJwtSecret()
  return jwt.sign({ userId: user.id, email: user.email, username: user.username }, secret, { expiresIn: JWT_EXPIRES })
}

/**
 * Extracts and verifies JWT from `Authorization: Bearer <token>` header.
 * Returns the decoded payload or null if invalid/missing — never throws.
 */
export async function verifyToken(event: H3Event): Promise<AuthUser | null> {
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  try {
    const secret = await getJwtSecret()
    return jwt.verify(token, secret) as AuthUser
  } catch {
    return null
  }
}

/** Same as verifyToken, but throws a Nitro 401 error if no valid token is present. */
export async function requireAuth(event: H3Event): Promise<AuthUser> {
  const user = await verifyToken(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized. Please log in.' })
  }
  return user
}
