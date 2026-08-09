import type { StatusConfig } from '~/types/visa-check'

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  'APPROVED': { cls: 'approved', icon: 'check', label: 'Approved' },
  'VISA USED': { cls: 'used', icon: 'pass', label: 'Visa Used' },
  'UNDER REVIEW': { cls: 'review', icon: 'search', label: 'Under Review' },
  'APP/RECEIVED': { cls: 'received', icon: 'inbox', label: 'App. Received' },
  'RECEIVED': { cls: 'received', icon: 'inbox', label: 'Received' },
  'REJECTED': { cls: 'rejected', icon: 'x', label: 'Rejected' },
  'CANCELLED': { cls: 'cancelled', icon: 'x', label: 'Cancelled' },
  'RETURNED': { cls: 'cancelled', icon: 'x', label: 'Returned' },
  'PENDING SUPPLEMENT': { cls: 'pending', icon: 'clock', label: 'Supplement Needed' },
  'EXPIRED': { cls: 'rejected', icon: 'clock', label: 'Expired' },
  'UNKNOWN': { cls: 'pending', icon: 'clock', label: 'Unknown' },
  'Pending': { cls: 'pending', icon: 'clock', label: 'Pending' }
}

/** Statuses considered "real" enough to synthesize a cached result when the live check reports not-found. */
export const REAL_STATUSES = [
  'APPROVED',
  'VISA USED',
  'UNDER REVIEW',
  'APP/RECEIVED',
  'RECEIVED',
  'REJECTED',
  'CANCELLED',
  'RETURNED',
  'PENDING SUPPLEMENT',
  'EXPIRED'
]

export function statusConfigFor(rawStatus: string | undefined): StatusConfig {
  const raw = rawStatus || 'UNKNOWN'
  return STATUS_CONFIG[raw] || { cls: 'pending', icon: 'clock', label: raw }
}

export function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return 'some time ago'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min. ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr. ago`
  return `${Math.floor(h / 24)} days ago`
}
