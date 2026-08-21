/**
 * PM2 process definition for the SalomKorea Nuxt server.
 *
 * Secrets are read from .env ONLY — never hardcoded here. This file is tracked
 * in git, so any literal credential in it is a published credential.
 *
 * Load order (later wins): nuxt-app/.env, then repo-root .env.
 * Anything already in the real process environment always takes precedence.
 */

const path = require('path')
const fs = require('fs')

// dotenv lives in nuxt-app/node_modules; resolve it explicitly so this works
// regardless of which directory pm2 is invoked from.
let dotenv
try {
  dotenv = require(require.resolve('dotenv', { paths: [__dirname] }))
} catch {
  console.error(
    '[ecosystem] FATAL: dotenv is not installed. Run `npm install` in nuxt-app/ before starting pm2.'
  )
  process.exit(1)
}

const envFiles = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env')
]

let loadedAny = false
for (const file of envFiles) {
  if (!fs.existsSync(file)) continue
  const result = dotenv.config({ path: file, override: false })
  if (result.error) {
    console.error(`[ecosystem] FATAL: failed to parse ${file}: ${result.error.message}`)
    process.exit(1)
  }
  console.log(`[ecosystem] Loaded env from ${file}`)
  loadedAny = true
}

if (!loadedAny) {
  console.error(
    `[ecosystem] FATAL: no .env file found. Looked in:\n  ${envFiles.join('\n  ')}`
  )
  process.exit(1)
}

// Secrets with no safe default. Starting without these previously fell back to
// values committed in this repo (public), so we fail fast instead.
const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'ADMIN_SECRET',
  'BOT_ENCRYPTION_KEY'
]

// Optional, but the app silently degrades without them, which is hard to spot:
// missing PUSHER_* makes /api/realtime/config fall back to in-process SSE.
const OPTIONAL_GROUPS = {
  'Pusher realtime (falls back to SSE)': [
    'PUSHER_APP_ID',
    'PUSHER_KEY',
    'PUSHER_SECRET',
    'PUSHER_CLUSTER'
  ],
  'AI assistant (endpoint returns a warning without one)': [
    'OPENAI_API_KEY',
    'GEMINI_API_KEY'
  ]
}

const missing = REQUIRED.filter(key => !process.env[key])
if (missing.length > 0) {
  console.error(
    `[ecosystem] FATAL: missing required environment variable(s): ${missing.join(', ')}\n`
    + `Set them in ${envFiles[0]} (or the repo-root .env) before starting pm2.`
  )
  process.exit(1)
}

for (const [label, keys] of Object.entries(OPTIONAL_GROUPS)) {
  const absent = keys.filter(key => !process.env[key])
  // The AI group needs only one of the two; the Pusher group needs all four.
  const isAiGroup = label.startsWith('AI assistant')
  const degraded = isAiGroup ? absent.length === keys.length : absent.length > 0
  if (degraded) {
    console.warn(`[ecosystem] WARNING: ${label} — not configured (missing: ${absent.join(', ')})`)
  }
}

// Forward every variable the server actually reads. Values come from the
// environment loaded above; there are no literals here by design.
const PASSTHROUGH = [
  ...REQUIRED,
  ...Object.values(OPTIONAL_GROUPS).flat(),
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'CRON_SECRET',
  'NUXT_PUBLIC_API_BASE'
]

const env = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  PORT: process.env.PORT || 3000,
  NITRO_HOST: '0.0.0.0',
  NITRO_PORT: process.env.NITRO_PORT || process.env.PORT || 3000
}

for (const key of PASSTHROUGH) {
  if (process.env[key] !== undefined) env[key] = process.env[key]
}

module.exports = {
  apps: [
    {
      name: 'salomkorea',
      script: './.output/server/index.mjs',
      cwd: '/www/wwwroot/salomkorea/nuxt-app',
      instances: 1,
      // Must stay 'fork' with instances: 1 — the SSE fallback in
      // server/utils/event-bus.ts is per-process in-memory state, so clustering
      // would send events to whichever worker happens to serve the request
      // rather than the one holding the client's SSE connection.
      exec_mode: 'fork',
      max_memory_restart: '512M',
      // The worker loop runs for minutes; give in-flight checks time to drain
      // on reload instead of severing them mid-write.
      kill_timeout: 15000,
      env
    }
  ]
}
