/**
 * server/utils/realtime-types.ts
 *
 * Typed shapes for every realtime event the server publishes.
 * Shared between the EventBus, the SSE endpoint, and the mutation handlers.
 */

export interface StudentPayload {
  passport: string
  fullName: string
  birthday: string
  studentId?: string
  status: string
  applicationDate?: string
  lastChecked?: string
  rejectReason?: string
  pdfUrl?: string
  apiResponse?: string
  batchSelected?: boolean
  batchSelectedUpdatedAt?: string
  createdAt?: string
  userId?: number
  visaType: string
  applicationNo?: string
  deletedAt?: string | null
  pinned?: boolean
}

export interface BaseEvent {
  /** UUID generated server-side — used by clients for idempotency deduplication. */
  eventId: string
  /** ISO timestamp from the server — used for event ordering / race-condition guard. */
  updatedAt: string
  /**
   * The clientId of the browser that triggered the mutation.
   * The originating browser uses this to skip its own events (already applied optimistically).
   */
  originClientId: string
}

export interface StudentCreatedEvent extends BaseEvent {
  type: 'student.created'
  student: StudentPayload
}

export interface StudentUpdatedEvent extends BaseEvent {
  type: 'student.updated'
  passport: string
  changes: Partial<StudentPayload>
}

export interface StudentDeletedEvent extends BaseEvent {
  type: 'student.deleted'
  passports: string[]
}

export interface StudentRestoredEvent extends BaseEvent {
  type: 'student.restored'
  student: StudentPayload
}

export type StudentRealtimeEvent =
  | StudentCreatedEvent
  | StudentUpdatedEvent
  | StudentDeletedEvent
  | StudentRestoredEvent
