export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '--'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatTimestamp(timestamp: string | undefined | null): string {
  if (!timestamp) return 'Never'
  return new Date(timestamp).toLocaleString('en-US')
}

/** Compact relative time (e.g. "2 h. 5 min. ago") used in dense table cells. */
export function formatTimestampCompact(timestamp: string | undefined | null, nowInput?: Date | number): string {
  if (!timestamp) return 'Never'
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return 'Never'
  const now = nowInput ? (typeof nowInput === 'number' ? new Date(nowInput) : nowInput) : new Date()
  const diffMs = Math.max(0, now.getTime() - date.getTime())

  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'Just now'

  if (diffDays >= 7) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (diffDays > 0) {
    const remainingHours = diffHours % 24
    const remainingMinutes = diffMinutes % 60
    const dayLabel = diffDays === 1 ? 'day' : 'days'
    let label = `${diffDays} ${dayLabel}`
    if (remainingHours > 0) label += ` ${remainingHours} h.`
    if (remainingMinutes > 0) label += ` ${remainingMinutes} min.`
    return `${label} ago`
  }

  if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60
    let label = `${diffHours} h.`
    if (remainingMinutes > 0) label += ` ${remainingMinutes} min.`
    return `${label} ago`
  }

  return `${diffMinutes} min. ago`
}
