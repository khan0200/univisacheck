import { initDb } from '../lib/turso'

export default defineNitroPlugin(async () => {
  try {
    await initDb()
    console.log('[db-init plugin] Database initialized successfully on server startup.')
  } catch (err: any) {
    console.error('[db-init plugin] Failed to initialize database on startup:', err.message)
  }
})
