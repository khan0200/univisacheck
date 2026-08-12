/**
 * app/composables/useRealtimeSync.ts
 *
 * Distributed realtime synchronization composable.
 * Connects to Pusher if available, or falls back to standard SSE.
 * Keeps studentsStore and activeJob state in sync by processing realtime events.
 */

import type PusherClass from 'pusher-js'
import type { Student } from '~/types/student'

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

interface RealtimeConfig {
  provider: 'pusher' | 'sse'
  key?: string
  cluster?: string
}

interface RealtimeEvent {
  eventId: string
  originClientId: string
  student?: Student
  passport?: string
  changes?: Partial<Student>
  updatedAt?: string
  passports?: string[]
  status?: string
  total?: number
  progress?: {
    queued: number
    processing: number
    completed: number
    failed: number
    cancelled: number
  }
  studentId?: string
  result?: {
    status: string
    lastChecked?: string
  }
  // visa_processing_started fields
  notificationId?: number
  applicationDate?: string
  visaTypes?: string[]
  message?: string
  createdAt?: string
}

// Global singletons to ensure only one connection exists per dashboard session
let globalSource: EventSource | null = null
let globalPusher: PusherClass | null = null
let globalClientId: string | null = null
const globalStatus = ref<RealtimeStatus>('connecting')
let refCount = 0

let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

// Tracks whether we have ever successfully connected in this session.
// Used to distinguish a genuine reconnect (should reconcile) from the
// initial connection on page load (should NOT trigger a full reload).
let hadSuccessfulConnection = false

// Rolling dedup set for idempotency
const seenEventIds = new Set<string>()
const EVENT_ID_HISTORY = 100

function trackEventId(id: string): boolean {
  if (!id) return true
  if (seenEventIds.has(id)) return false
  seenEventIds.add(id)
  if (seenEventIds.size > EVENT_ID_HISTORY) {
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

  async function connect() {
    if (!import.meta.client) return
    if (!authStore.token) return
    if (globalSource || globalPusher) return

    // 1. Fetch Realtime config from backend
    let config: RealtimeConfig = { provider: 'sse' }
    try {
      config = await $fetch<RealtimeConfig>('/api/realtime/config')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Realtime Sync] Failed to fetch realtime config, falling back to SSE:', msg)
    }

    const clientId = getClientId()

    if (config.provider === 'pusher' && config.key && config.cluster) {
      // ─── PUSHER CONNECTION ───
      console.log('[Realtime Sync] Initializing distributed Pusher connection...')
      globalStatus.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'

      try {
        const { default: Pusher } = await import('pusher-js')
        const pusher = new Pusher(config.key, {
          cluster: config.cluster,
          authEndpoint: '/api/realtime/auth',
          auth: {
            headers: {
              Authorization: `Bearer ${authStore.token}`
            }
          }
        })
        globalPusher = pusher

        pusher.connection.bind('state_change', (states: { current: string }) => {
          console.log(`[Pusher Connection] State changed: ${states.current}`)
          if (states.current === 'connected') {
            reconnectAttempts = 0
            globalStatus.value = 'connected'

            if (hadSuccessfulConnection) {
              // Genuine reconnect after a drop — reconcile state with server
              console.log('[Realtime Sync] Pusher reconnected! Reconciling state...')
              studentsStore.loadStudents().catch(() => {})
            } else {
              // First successful connection on this page load — no reload needed
              hadSuccessfulConnection = true
            }
          } else if (states.current === 'connecting') {
            globalStatus.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
          } else if (states.current === 'unavailable' || states.current === 'failed') {
            globalStatus.value = 'offline'
          }
        })

        // Subscribe to private channel scoped for this user
        const channelName = `private-user-${authStore.user?.id}`
        const channel = pusher.subscribe(channelName)

        // Bind events
        channel.bind('student.created', (ev: RealtimeEvent) => {
          if (!trackEventId(ev.eventId)) return
          if (ev.originClientId === clientId) return
          if (ev.student) {
            studentsStore.upsertLocal(ev.student)
          }
        })

        channel.bind('student.updated', (ev: RealtimeEvent) => {
          if (!trackEventId(ev.eventId)) return
          if (ev.originClientId === clientId) return
          if (ev.passport && ev.changes) {
            const patched = studentsStore.patchStudent(ev.passport, ev.changes, ev.updatedAt)
            if (!patched) {
              studentsStore.loadStudents().catch(() => {})
            }
          }
        })

        channel.bind('student.deleted', (ev: RealtimeEvent) => {
          if (!trackEventId(ev.eventId)) return
          if (ev.originClientId === clientId) return
          if (ev.passports) {
            studentsStore.removeLocal(ev.passports)
          }
        })

        channel.bind('student.restored', (ev: RealtimeEvent) => {
          if (!trackEventId(ev.eventId)) return
          if (ev.originClientId === clientId) return
          if (ev.student) {
            studentsStore.upsertLocal(ev.student)
          }
        })

        channel.bind('visa_processing_started', (ev: RealtimeEvent) => {
          const { add: addProcessingNotification } = useProcessingNotifications()
          addProcessingNotification(ev as unknown as Record<string, unknown>)
        })

        // Bind Visa Check Job events
        channel.bind('visa_check.started', (ev: RealtimeEvent) => {
          if (ev.studentId) {
            const matchingKey = Array.from(studentsStore.checkingPassports.keys())
              .find(k => k.toUpperCase().trim() === ev.studentId!.toUpperCase().trim()) || ev.studentId
            studentsStore.checkingPassports.set(matchingKey, 'processing')
            studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
          }
        })

        channel.bind('visa_check.progress', (ev: RealtimeEvent) => {
          console.log('[Realtime Sync] Received visa check progress via Pusher:', ev)
          if (ev.status === 'completed' || ev.status === 'failed' || ev.status === 'cancelled') {
            studentsStore.activeJob = null
            studentsStore.checkingPassports = new Map()
          } else {
            studentsStore.activeJob = ev as unknown as typeof studentsStore.activeJob
          }
        })

        channel.bind('visa_check.completed', (ev: RealtimeEvent) => {
          if (ev.studentId && ev.result) {
            // Remove from checkingPassports set reactively
            const matchingKey = Array.from(studentsStore.checkingPassports.keys())
              .find(k => k.toUpperCase().trim() === ev.studentId!.toUpperCase().trim())
            if (matchingKey) {
              studentsStore.checkingPassports.delete(matchingKey)
            } else {
              studentsStore.checkingPassports.delete(ev.studentId)
            }
            studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

            // Re-upsert individual student status & lastChecked timestamp locally
            const normalizedPassport = ev.studentId.toUpperCase().trim()
            const student = studentsStore.students.find(s => s.passport.toUpperCase().trim() === normalizedPassport)
            const updatedTime = ev.result.lastChecked || new Date().toISOString()
            if (student) {
              student.status = ev.result.status
              student.lastChecked = updatedTime
              studentsStore.patchStudent(student.passport, {
                status: ev.result.status,
                lastChecked: updatedTime
              })
            }
          }
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Realtime Sync] Pusher setup failed, falling back to SSE:', msg)
        connectSSE(clientId)
      }
    } else {
      // ─── SSE CONNECTION (FALLBACK) ───
      connectSSE(clientId)
    }
  }

  function connectSSE(clientId: string) {
    console.log('[Realtime Sync] Initializing fallback SSE connection...')
    const token = encodeURIComponent(authStore.token || '')
    const url = `/api/realtime?token=${token}&clientId=${encodeURIComponent(clientId)}`

    globalStatus.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'

    const source = new EventSource(url)
    globalSource = source

    source.addEventListener('connected', () => {
      reconnectAttempts = 0
      globalStatus.value = 'connected'

      if (hadSuccessfulConnection) {
        // Genuine reconnect after a drop — reconcile state with server
        console.log('[Realtime Sync] SSE reconnected! Reconciling state...')
        studentsStore.loadStudents().catch(() => {})
      } else {
        // First successful connection on this page load — no reload needed
        hadSuccessfulConnection = true
      }
    })

    source.addEventListener('student.created', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        if (!trackEventId(ev.eventId)) return
        if (ev.originClientId === clientId) return
        if (ev.student) {
          studentsStore.upsertLocal(ev.student)
        }
      } catch {
        // Parse error ignored
      }
    })

    source.addEventListener('student.updated', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        if (!trackEventId(ev.eventId)) return
        if (ev.originClientId === clientId) return
        if (ev.passport && ev.changes) {
          const patched = studentsStore.patchStudent(ev.passport, ev.changes, ev.updatedAt)
          if (!patched) {
            studentsStore.loadStudents().catch(() => {})
          }
        }
      } catch {
        // Parse error ignored
      }
    })

    source.addEventListener('student.deleted', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        if (!trackEventId(ev.eventId)) return
        if (ev.originClientId === clientId) return
        if (ev.passports) {
          studentsStore.removeLocal(ev.passports)
        }
      } catch {
        // Parse error ignored
      }
    })

    source.addEventListener('student.restored', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        if (!trackEventId(ev.eventId)) return
        if (ev.originClientId === clientId) return
        if (ev.student) {
          studentsStore.upsertLocal(ev.student)
        }
      } catch {
        // Parse error ignored
      }
    })

    // Bind Visa Check Job events on EventSource fallback
    source.addEventListener('visa_check.started', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        if (ev.studentId) {
          const matchingKey = Array.from(studentsStore.checkingPassports.keys())
            .find(k => k.toUpperCase().trim() === ev.studentId!.toUpperCase().trim()) || ev.studentId
          studentsStore.checkingPassports.set(matchingKey, 'processing')
          studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)
        }
      } catch {
        // Parse error ignored
      }
    })

    source.addEventListener('visa_check.progress', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        console.log('[Realtime Sync] Received visa check progress via SSE:', ev)
        if (ev.status === 'completed' || ev.status === 'failed' || ev.status === 'cancelled') {
          studentsStore.activeJob = null
          studentsStore.checkingPassports = new Map()
        } else {
          studentsStore.activeJob = ev as unknown as typeof studentsStore.activeJob
        }
      } catch {
        // Parse error ignored
      }
    })

    source.addEventListener('visa_check.completed', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        if (ev.studentId && ev.result) {
          // Remove from checkingPassports set reactively
          const matchingKey = Array.from(studentsStore.checkingPassports.keys())
            .find(k => k.toUpperCase().trim() === ev.studentId!.toUpperCase().trim())
          if (matchingKey) {
            studentsStore.checkingPassports.delete(matchingKey)
          } else {
            studentsStore.checkingPassports.delete(ev.studentId)
          }
          studentsStore.checkingPassports = new Map(studentsStore.checkingPassports)

          const normalizedPassport = ev.studentId.toUpperCase().trim()
          const student = studentsStore.students.find(s => s.passport.toUpperCase().trim() === normalizedPassport)
          const updatedTime = ev.result.lastChecked || new Date().toISOString()
          if (student) {
            student.status = ev.result.status
            student.lastChecked = updatedTime
            studentsStore.patchStudent(student.passport, {
              status: ev.result.status,
              lastChecked: updatedTime
            })
          }
        }
      } catch {
        // Parse error ignored
      }
    })

    source.addEventListener('visa_processing_started', (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as RealtimeEvent
        const { add: addProcessingNotification } = useProcessingNotifications()
        addProcessingNotification(ev as unknown as Record<string, unknown>)
      } catch {
        // Parse error ignored
      }
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
        reconnectTimer = setTimeout(() => connect(), delay)
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
    if (globalPusher) {
      globalPusher.disconnect()
      globalPusher = null
    }
    globalStatus.value = 'connecting'
    reconnectAttempts = 0
    hadSuccessfulConnection = false
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

export function getRealtimeClientId(): string {
  if (!globalClientId) globalClientId = crypto.randomUUID()
  return globalClientId
}
