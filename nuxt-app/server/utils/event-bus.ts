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

// Map: userId → Set of writer functions (one per active SSE connection)
const connections = new Map<number, Set<SSEWriter>>()

/**
 * Publish an event to all active SSE connections for `userId`.
 * Safe to call even if no connections exist yet.
 */
function publish(userId: number, event: any): void {
  const writers = connections.get(userId)
  if (!writers || writers.size === 0) return
  for (const write of writers) {
    try {
      write(event)
    } catch {
      // Writer already closed — it will clean up on disconnect
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

  return () => {
    const writers = connections.get(userId)
    if (writers) {
      writers.delete(writer)
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
