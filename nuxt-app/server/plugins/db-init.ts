import { initDb } from '../lib/turso'

export default defineNitroPlugin(async () => {
  if (import.meta.prerender) {
    return
  }
  try {
    await initDb()
    console.log('[db-init plugin] Database initialized successfully on server startup.')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[db-init plugin] Failed to initialize database on startup:', msg)
  }
})
