/**
 * server/api/realtime/auth.post.ts
 *
 * Pusher channel authorization endpoint.
 * Validates the JWT and ensures the user can only subscribe to their own
 * channel: private-user-${userId}.
 */

import Pusher from 'pusher'
import { verifyToken } from '../../utils/auth'
import { apiError } from '../../utils/api-error'

let pusherClient: Pusher | null = null

function getPusher(): Pusher | null {
  if (pusherClient) return pusherClient

  const appId = process.env.PUSHER_APP_ID
  const key = process.env.PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.PUSHER_CLUSTER

  if (appId && key && secret && cluster) {
    pusherClient = new Pusher({ appId, key, secret, cluster, useTLS: true })
    return pusherClient
  }
  return null
}

export default defineEventHandler(async (event) => {
  const pusher = getPusher()
  if (!pusher) {
    apiError(400, 'Pusher is not configured on this server.')
  }

  // 1. Authenticate user from JWT token
  const authUser = await verifyToken(event)
  if (!authUser) {
    apiError(401, 'Unauthorized')
  }

  // 2. Parse body (Pusher sends socket_id and channel_name as urlencoded or JSON)
  let body: any = {}
  try {
    const contentType = getHeader(event, 'content-type') || ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      body = await readBody(event) // H3 automagically parses urlencoded too
    } else {
      body = await readBody(event)
    }
  } catch {
    apiError(400, 'Invalid request body')
  }

  const socketId = body.socket_id
  const channelName = body.channel_name

  if (!socketId || !channelName) {
    apiError(400, 'Missing socket_id or channel_name')
  }

  // 3. Enforce channel scope security: private-user-${userId}
  const expectedChannel = `private-user-${authUser.userId}`
  if (channelName !== expectedChannel) {
    apiError(403, 'Forbidden: You cannot subscribe to another user\'s channel.')
  }

  // 4. Generate Pusher auth signature
  try {
    const authResponse = pusher.authorizeChannel(socketId, channelName)
    return authResponse
  } catch (err: any) {
    console.error('[Pusher Auth] Authorization failed:', err.message)
    apiError(500, 'Pusher authorization failed')
  }
})
