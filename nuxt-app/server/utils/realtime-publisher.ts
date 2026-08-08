/**
 * server/utils/realtime-publisher.ts
 *
 * Distributed realtime publisher. If Pusher credentials are provided in the env,
 * it publishes events to Pusher (which supports multi-instance Vercel environments).
 * Otherwise, it falls back to the in-memory EventBus for local development.
 */

import Pusher from 'pusher'
import { EventBus } from './event-bus'

let pusherClient: Pusher | null = null

function getPusherClient(): Pusher | null {
  if (pusherClient) return pusherClient

  const appId = process.env.PUSHER_APP_ID
  const key = process.env.PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.PUSHER_CLUSTER

  if (appId && key && secret && cluster) {
    console.log('[Realtime Publisher] Initializing Pusher client...')
    pusherClient = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true
    })
    return pusherClient
  }

  return null
}

/**
 * Publishes a realtime event to a user's subscription channel.
 */
export async function publishRealtime(userId: number, event: { type: string; [key: string]: any }): Promise<void> {
  const pusher = getPusherClient()
  if (pusher) {
    try {
      const channel = `private-user-${userId}`
      // Trigger the event via Pusher. Pusher events are scoped per user.
      await pusher.trigger(channel, event.type, event)
      console.log(`[Realtime Publisher] Event ${event.type} triggered on Pusher channel ${channel}`)
    } catch (err: any) {
      console.error('[Realtime Publisher] Pusher trigger failed, falling back to EventBus:', err.message)
      EventBus.publish(userId, event as any)
    }
  } else {
    // Fallback to in-memory EventBus
    EventBus.publish(userId, event as any)
  }
}
