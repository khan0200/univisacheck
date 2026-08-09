import { createClient } from '@libsql/client'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

async function loadLocalConfig() {
  try {
    const envPath = path.join(process.cwd(), '.env')
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8')
      const env = {}
      for (const line of content.split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
          env[match[1]] = match[2].replace(/^["']|["']$/g, '')
        }
      }
      return {
        TURSO_DATABASE_URL: env.TURSO_URL,
        TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN
      }
    }
  } catch (e) {
    console.error(e)
  }
  return {}
}

async function migrate() {
  const localConfig = await loadLocalConfig()
  const url = process.env.TURSO_URL || localConfig.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN || localConfig.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    console.error('Missing Turso credentials in turso.config.js')
    process.exit(1)
  }

  const db = createClient({ url, authToken })

  try {
    console.log('Adding pinned column to students table...')
    await db.execute('ALTER TABLE students ADD COLUMN pinned INTEGER DEFAULT 0;')
    console.log('Successfully added pinned column!')
  } catch (err) {
    // Ignore error if column already exists
    if (err.message && err.message.includes('duplicate column name')) {
      console.log('Column pinned already exists, skipping...')
    } else {
      console.error('Migration failed:', err.message)
      process.exit(1)
    }
  }

  process.exit(0)
}

migrate()
