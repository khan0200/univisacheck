/**
 * server/api/realtime.get.ts
 *
 * Server-Sent Events (SSE) endpoint that streams realtime student events to
 * authenticated browser clients.
 *
 * Authentication:
 *   The standard EventSource API does not support custom request headers, so
 *   the JWT is accepted from a `token` query parameter in addition to the
 *   standard Authorization header. The token is verified with the same
 *   verifyToken utility used everywhere else — the userId is derived from
 *   the verified payload, never trusted from the client.
 *
 * Connection lifecycle:
 *   1. Client opens GET /api/realtime?token=<jwt>&clientId=<uuid>
 *   2. Server verifies token → registers with EventBus
 *   3. Sends a `connected` event with the server timestamp
 *   4. Keeps connection alive with a comment ping every 25s
 *   5. On disconnect: unsubscribes from EventBus, clears ping interval
 *
 * Security:
 *   - userId is extracted from the verified JWT — never from query params
 *   - Events are scoped per userId — no user ever sees another user's data
 *   - clientId is echoed in events so the originating browser can skip its own
 */

import { EventBus } from '../utils/event-bus'
import { verifyToken } from '../utils/auth'
import type { StudentRealtimeEvent } from '../utils/realtime-types'

export default defineEventHandler(async (event) => {
  // ── 1. Authenticate ──────────────────────────────────────────────────────
  // Accept token from query param (EventSource can't set headers) or header
  const query = getQuery(event)
  const tokenFromQuery = query.token as string | undefined

  let authUser = await verifyToken(event)

  if (!authUser && tokenFromQuery) {
    // Temporarily inject the token into the Authorization header for reuse
    event.node.req.headers['authorization'] = `Bearer ${tokenFromQuery}`
    authUser = await verifyToken(event)
  }

  if (!authUser) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const userId = authUser.userId
  const clientId = (query.clientId as string | undefined) || 'unknown'

  // ── 2. Set SSE response headers ──────────────────────────────────────────
  const res = event.node.res
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering if present
  })

  // ── 3. Helper to send a typed SSE message ───────────────────────────────
  function sendSSE(eventName: string, data: unknown) {
    if (res.destroyed) return
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      // Connection closed
    }
  }

  // ── 4. Send initial connection confirmation ──────────────────────────────
  sendSSE('connected', {
    clientId,
    userId,
    serverTime: new Date().toISOString()
  })

  // ── 5. Register EventBus writer ──────────────────────────────────────────
  const writer = (realtimeEvent: any) => {
    sendSSE(realtimeEvent.type, realtimeEvent)
  }

  const unsubscribe = EventBus.subscribe(userId, writer)

  // ── 6. Keep-alive ping every 25s ────────────────────────────────────────
  // SSE connections time out on proxies/load-balancers without periodic data.
  // A comment line (": ping") resets the timeout without triggering a client
  // message event.
  const pingInterval = setInterval(() => {
    if (res.destroyed) {
      clearInterval(pingInterval)
      return
    }
    try {
      res.write(': ping\n\n')
    } catch {
      clearInterval(pingInterval)
    }
  }, 25_000)

  // ── 7. Cleanup on disconnect ─────────────────────────────────────────────
  event.node.req.on('close', () => {
    clearInterval(pingInterval)
    unsubscribe()
  })

  event.node.req.on('error', () => {
    clearInterval(pingInterval)
    unsubscribe()
  })

  // Hold the connection open — Nitro will not close it automatically because
  // we write the headers manually and manage the stream ourselves.
  // Return a promise that never resolves (the close event above handles cleanup).
  return new Promise<void>(() => {})
})
