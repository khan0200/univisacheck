/**
 * server/api/realtime/config.get.ts
 *
 * Exposes public realtime configuration (provider, key, cluster) so the frontend
 * knows whether to initialize Pusher or fall back to standard SSE.
 */

export default defineEventHandler((event) => {
  const isPusherEnabled = Boolean(
    process.env.PUSHER_APP_ID
    && process.env.PUSHER_KEY
    && process.env.PUSHER_SECRET
    && process.env.PUSHER_CLUSTER
  )

  if (isPusherEnabled) {
    return {
      provider: 'pusher',
      key: process.env.PUSHER_KEY,
      cluster: process.env.PUSHER_CLUSTER
    }
  }

  return {
    provider: 'sse'
  }
})
