/**
 * server/utils/event-bus.ts
 *
 * Lightweight in-memory pub/sub that fans realtime events out to all active
 * SSE connections for a given userId within this Nitro process.
 *
 * On Vercel each SSE connection is a long-lived function instance. The EventBus
 * handles fan-out to multiple concurrent SSE connections that share the same
 * warm instance. Because the originating browser already applies its own change
 * optimistically, it uses `originClientId` to skip its own event.
 */

import type { StudentRealtimeEvent } from './realtime-types'

type SSEWriter = (event: any) => void

// Use globalThis to avoid duplicate instances of EventBus due to Vite/Nuxt module reloading
const GLOBAL_CONNECTIONS_KEY = Symbol.for('event-bus.connections')
if (!(GLOBAL_CONNECTIONS_KEY in globalThis)) {
  (globalThis as any)[GLOBAL_CONNECTIONS_KEY] = new Map<number, Set<SSEWriter>>()
}
const connections: Map<number, Set<SSEWriter>> = (globalThis as any)[GLOBAL_CONNECTIONS_KEY]

/**
 * Publish an event to all active SSE connections for `userId`.
 * Safe to call even if no connections exist yet.
 */
function publish(userId: number, event: any): void {
  const writers = connections.get(userId)
  console.log(`[EventBus] Publishing event to userId: ${userId}, eventType: ${event.type}, active subscribers: ${writers ? writers.size : 0}`)
  if (!writers || writers.size === 0) return
  for (const write of writers) {
    try {
      write(event)
    } catch (err: any) {
      console.error(`[EventBus] Failed to write event to subscriber for userId ${userId}:`, err.message)
    }
  }
}

/**
 * Register a new SSE connection writer for `userId`.
 * Returns an unsubscribe function to call on disconnect.
 */
function subscribe(userId: number, writer: SSEWriter): () => void {
  if (!connections.has(userId)) {
    connections.set(userId, new Set())
  }
  connections.get(userId)!.add(writer)
  console.log(`[EventBus] Subscribed subscriber for userId: ${userId}, total user subscribers: ${connections.get(userId)!.size}`)

  return () => {
    const writers = connections.get(userId)
    if (writers) {
      writers.delete(writer)
      console.log(`[EventBus] Unsubscribed subscriber for userId: ${userId}, remaining user subscribers: ${writers.size}`)
      if (writers.size === 0) connections.delete(userId)
    }
  }
}

/** Number of active SSE connections (for debugging). */
function size(): number {
  let total = 0
  for (const writers of connections.values()) total += writers.size
  return total
}

export const EventBus = { publish, subscribe, size }

