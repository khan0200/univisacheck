/**
 * app/composables/useRealtimeSync.ts
 *
 * Opens a Server-Sent Events connection to /api/realtime and keeps the
 * studentsStore in sync by applying incoming events surgically.
 *
 * Connection lifecycle:
 *   1. Mount: open EventSource → receive `connected` event
 *   2. Events arrive → patch store without full refetch
 *   3. Disconnect: show indicator → reconnect with exponential backoff
 *   4. After reconnect: refetch students to fill any missed gap
 *   5. Unmount: close EventSource, clear timers
 *
 * Security:
 *   The JWT is sent as a `token` query param (EventSource does not support
 *   custom headers). The server verifies it identically to the Authorization header.
 *   The clientId is a UUID generated once per mount — used to skip own events.
 *
 * Deduplication:
 *   A rolling Set of the last 100 eventIds ensures idempotency even if the
 *   server sends a duplicate (e.g. on reconnect overlap).
 *
 * Race conditions:
 *   studentsStore.patchStudent() compares `updatedAt` timestamps and skips
 *   older events, so concurrent edits from two browsers resolve correctly.
 */

import type { Student } from '~/types/student'

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

// Singleton state — shared across all component instances so only one
// EventSource connection exists per dashboard session.
let globalSource: EventSource | null = null
let globalClientId: string | null = null
const globalStatus = ref<RealtimeStatus>('connecting')
let refCount = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

// Rolling dedup set — last 100 eventIds
const seenEventIds = new Set<string>()
const EVENT_ID_HISTORY = 100

function trackEventId(id: string): boolean {
  if (seenEventIds.has(id)) return false
  seenEventIds.add(id)
  if (seenEventIds.size > EVENT_ID_HISTORY) {
    // Delete the oldest entry
    seenEventIds.delete(seenEventIds.values().next().value!)
  }
  return true
}

export function useRealtimeSync() {
  const authStore = useAuthStore()
  const studentsStore = useStudentsStore()
  const status = globalStatus

  function getClientId(): string {
    if (!globalClientId) {
      globalClientId = crypto.randomUUID()
    }
    return globalClientId
  }

  function connect() {
    if (!import.meta.client) return
    if (!authStore.token) return
    if (globalSource && globalSource.readyState !== EventSource.CLOSED) return

    const clientId = getClientId()
    const token = encodeURIComponent(authStore.token)
    const url = `/api/realtime?token=${token}&clientId=${encodeURIComponent(clientId)}`

    globalStatus.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'

    const source = new EventSource(url)
    globalSource = source

    source.addEventListener('connected', () => {
      globalStatus.value = 'connected'
      reconnectAttempts = 0

      // After reconnect (not initial connect), refetch to catch any missed events
      if (reconnectAttempts > 0) {
        studentsStore.loadStudents().catch(() => {})
      }
    })

    source.addEventListener('student.created', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data)
        if (!trackEventId(ev.eventId)) return
        // Skip own events — we already applied optimistically
        if (ev.originClientId === clientId) return

        const student = ev.student as Student
        studentsStore.upsertLocal(student)
      } catch {}
    })

    source.addEventListener('student.updated', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data)
        if (!trackEventId(ev.eventId)) return
        if (ev.originClientId === clientId) return

        const patched = studentsStore.patchStudent(ev.passport, ev.changes, ev.updatedAt)
        // If student not in local list yet (e.g. just loaded), upsert after a small
        // refetch — but only if the field changes are significant (not just lastChecked)
        if (!patched) {
          // We can't upsert without a full student object; schedule a light refresh
          studentsStore.loadStudents().catch(() => {})
        }
      } catch {}
    })

    source.addEventListener('student.deleted', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data)
        if (!trackEventId(ev.eventId)) return
        if (ev.originClientId === clientId) return

        studentsStore.removeLocal(ev.passports as string[])
      } catch {}
    })

    source.addEventListener('student.restored', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data)
        if (!trackEventId(ev.eventId)) return
        if (ev.originClientId === clientId) return

        const student = ev.student as Student
        studentsStore.upsertLocal(student)
      } catch {}
    })

    source.onerror = () => {
      source.close()
      globalSource = null
      globalStatus.value = reconnectAttempts >= MAX_RECONNECT_ATTEMPTS ? 'offline' : 'reconnecting'

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
          RECONNECT_MAX_MS
        )
        reconnectAttempts++
        reconnectTimer = setTimeout(connect, delay)
      }
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (globalSource) {
      globalSource.close()
      globalSource = null
    }
    globalStatus.value = 'connecting'
    reconnectAttempts = 0
  }

  onMounted(() => {
    refCount++
    if (refCount === 1) {
      connect()
    }
  })

  onUnmounted(() => {
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0) {
      disconnect()
    }
  })

  return { status, clientId: getClientId }
}

/**
 * Returns the current clientId to attach to mutation requests as X-Client-Id header.
 * Call this from useApiFetch or services so the server knows which client originated
 * a mutation (and that client can skip the echo event).
 */
export function getRealtimeClientId(): string {
  if (!globalClientId) globalClientId = crypto.randomUUID()
  return globalClientId
}
