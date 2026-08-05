import { createClient, type Client } from '@libsql/client'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

// Credentials come from environment variables in production (Vercel: TURSO_URL,
// TURSO_AUTH_TOKEN). For local dev, fall back to the repo-root turso.config.js
// (gitignored) — same pattern as api/db.js, so no secret is duplicated here.
async function loadLocalConfig(): Promise<{ TURSO_DATABASE_URL?: string, TURSO_AUTH_TOKEN?: string }> {
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (!existsSync(configPath)) return {}
    const mod = await import(pathToFileURL(configPath).href)
    return mod.default || mod
  } catch {
    return {}
  }
}

let client: Client | null = null

export async function getTursoClient(): Promise<Client> {
  if (client) return client

  const localConfig = await loadLocalConfig()
  const url = process.env.TURSO_URL || localConfig.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN || localConfig.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing Turso credentials. Set TURSO_URL and TURSO_AUTH_TOKEN environment variables (Vercel), or provide them in turso.config.js for local development.'
    })
  }

  client = createClient({ url, authToken })
  return client
}
