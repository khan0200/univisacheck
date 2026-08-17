const { existsSync, readFileSync } = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

let cached = null

async function loadLocalConfig() {
  if (cached) return cached
  cached = {}

  // 1. Try turso.config.js (repo root)
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (existsSync(configPath)) {
      const mod = await import(pathToFileURL(configPath).href)
      cached = { ...(mod.default || mod) }
    }
  } catch {}

  // 2. Parse .env files directly from disk to ensure secrets are always available
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '.output', 'server', '.env'),
    '/www/wwwroot/salomkorea/nuxt-app/.env',
    '/www/wwwroot/salomkorea/.env'
  ]

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const raw = readFileSync(envPath, 'utf8')
        for (const line of raw.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim()
            const val = trimmed.slice(eqIdx + 1).trim()
            if (!process.env[key] && val) process.env[key] = val
            if (!cached[key] && val) cached[key] = val
          }
        }
      } catch {}
    }
  }

  return cached
}

module.exports = { loadLocalConfig }
