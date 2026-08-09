const { existsSync } = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

// Shared by lib/ai/*.js and lib/db.js — repo-root turso.config.js
// (gitignored) supplies local-dev secrets. Nitro's ESM runtime has no
// `require`, so this must be a dynamic import(), same as
// server/utils/turso.ts and server/lib/db.js.
let cached = null

async function loadLocalConfig() {
  if (cached) return cached
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (!existsSync(configPath)) {
      cached = {}
      return cached
    }
    const mod = await import(pathToFileURL(configPath).href)
    cached = mod.default || mod
  } catch {
    cached = {}
  }
  return cached
}

module.exports = { loadLocalConfig }
