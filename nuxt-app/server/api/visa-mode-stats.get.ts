import { getTursoClient } from '../utils/turso'

export interface VisaModeStat {
  avgDays: number
  approvalRate: number
  approvedCount: number
  rejectedCount: number
  totalDecided: number
}

export type VisaModeStatsMap = Record<string, VisaModeStat>

const DEFAULT_STATS: VisaModeStatsMap = {
  'Embassy': { avgDays: 18, approvalRate: 81, approvedCount: 47, rejectedCount: 11, totalDecided: 58 },
  'E-Visa': { avgDays: 18, approvalRate: 82, approvedCount: 14, rejectedCount: 3, totalDecided: 17 },
  'Regional': { avgDays: 25, approvalRate: 100, approvedCount: 1, rejectedCount: 0, totalDecided: 1 }
}

let cachedStats: { success: boolean, stats: VisaModeStatsMap } | null = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes in-memory

function parseDate(str: unknown): Date | null {
  if (!str || typeof str !== 'string') return null
  const match = str.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (match && match[1] && match[2] && match[3]) {
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10))
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function getDaysDiff(d1: Date, d2: Date): number {
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime()
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime()
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24))
}

function extractDecisionDate(row: Record<string, unknown>): Date | null {
  let apiResp: Record<string, unknown> | null = null
  if (row.apiResponse) {
    if (typeof row.apiResponse === 'string') {
      try {
        apiResp = JSON.parse(row.apiResponse)
      } catch {
        apiResp = null
      }
    } else if (typeof row.apiResponse === 'object') {
      apiResp = row.apiResponse as Record<string, unknown>
    }
  }

  if (apiResp) {
    if (apiResp.entryDate && typeof apiResp.entryDate === 'string') {
      const d = parseDate(apiResp.entryDate)
      if (d) return d
    }
    const kor = String(apiResp.latestStatusKorean || apiResp.statusKorean || '')
    const korMatch = kor.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
    if (korMatch && korMatch[1] && korMatch[2] && korMatch[3]) {
      return new Date(parseInt(korMatch[1], 10), parseInt(korMatch[2], 10) - 1, parseInt(korMatch[3], 10))
    }
    if (apiResp.givenDate && typeof apiResp.givenDate === 'string') {
      const d = parseDate(apiResp.givenDate)
      if (d) return d
    }
    if (apiResp.statusDate && typeof apiResp.statusDate === 'string') {
      const d = parseDate(apiResp.statusDate)
      if (d) return d
    }
  }

  if (row.lastChecked && typeof row.lastChecked === 'string') {
    const d = parseDate(row.lastChecked)
    if (d) return d
  }

  return null
}

function normalizeVisaType(vt: unknown): 'Embassy' | 'E-Visa' | 'Regional' {
  const s = String(vt || '').toLowerCase().trim()
  if (s.includes('e-visa') || s.includes('evisa') || s.includes('electronic')) return 'E-Visa'
  if (s.includes('regio')) return 'Regional'
  return 'Embassy'
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
    'CDN-Cache-Control': 'public, s-maxage=600',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=600'
  })

  const now = Date.now()
  if (cachedStats && now < cacheExpiresAt) {
    return cachedStats
  }

  try {
    const db = await getTursoClient()
    const result = await db.execute(`
      SELECT passport, status, applicationDate, apiResponse, visaType, lastChecked
      FROM students
      WHERE deletedAt IS NULL
    `)

    // Deduplicate by passport
    const uniqueMap = new Map<string, Record<string, unknown>>()
    for (const r of result.rows) {
      const row = r as Record<string, unknown>
      const p = String(row.passport || '').toUpperCase().trim()
      if (!p) continue
      if (!uniqueMap.has(p)) {
        uniqueMap.set(p, row)
      } else {
        const ex = uniqueMap.get(p)!
        if ((!ex.apiResponse && row.apiResponse) || (ex.status === 'Pending' && row.status !== 'Pending')) {
          uniqueMap.set(p, row)
        }
      }
    }

    type VisaKey = 'Embassy' | 'E-Visa' | 'Regional'
    const typeGroups: Record<VisaKey, { approvedDays: number[], rejectedDays: number[], approvedCount: number, rejectedCount: number }> = {
      'Embassy': { approvedDays: [], rejectedDays: [], approvedCount: 0, rejectedCount: 0 },
      'E-Visa': { approvedDays: [], rejectedDays: [], approvedCount: 0, rejectedCount: 0 },
      'Regional': { approvedDays: [], rejectedDays: [], approvedCount: 0, rejectedCount: 0 }
    }

    for (const row of uniqueMap.values()) {
      const vType = normalizeVisaType(row.visaType) as VisaKey
      const st = String(row.status || '').toUpperCase()
      const isApproved = st.includes('APPROV') || st.includes('USED') || st.includes('ISSUED') || st.includes('TASDIQLANGAN')
      const isRejected = st.includes('REJECT') || st.includes('CANCEL') || st.includes('BEKOR') || st.includes('RAD')

      if (!isApproved && !isRejected) continue

      const targetGroup = typeGroups[vType]
      if (!targetGroup) continue
      const appDate = parseDate(row.applicationDate)
      const decDate = extractDecisionDate(row)

      if (isApproved) {
        targetGroup.approvedCount++
        if (appDate && decDate) {
          const days = getDaysDiff(appDate, decDate)
          if (days >= 0 && days < 180) {
            targetGroup.approvedDays.push(days)
          }
        }
      } else if (isRejected) {
        targetGroup.rejectedCount++
        if (appDate && decDate) {
          const days = getDaysDiff(appDate, decDate)
          if (days >= 0 && days < 180) {
            targetGroup.rejectedDays.push(days)
          }
        }
      }
    }

    const computedStats: VisaModeStatsMap = {}

    const keys: VisaKey[] = ['Embassy', 'E-Visa', 'Regional']
    for (const key of keys) {
      const g = typeGroups[key]
      const defaultVal = DEFAULT_STATS[key] || { avgDays: 18, approvalRate: 80, approvedCount: 0, rejectedCount: 0, totalDecided: 0 }
      const totalDecided = g.approvedCount + g.rejectedCount

      let approvalRate = defaultVal.approvalRate
      if (totalDecided > 0) {
        approvalRate = Math.round((g.approvedCount / totalDecided) * 100)
      }

      let avgDays = defaultVal.avgDays
      const hasApp = g.approvedDays.length > 0
      const hasRej = g.rejectedDays.length > 0

      if (hasApp && hasRej) {
        const avgApp = g.approvedDays.reduce((a, b) => a + b, 0) / g.approvedDays.length
        const avgRej = g.rejectedDays.reduce((a, b) => a + b, 0) / g.rejectedDays.length
        avgDays = Math.round((avgApp + avgRej) / 2)
      } else if (hasApp) {
        const avgApp = g.approvedDays.reduce((a, b) => a + b, 0) / g.approvedDays.length
        avgDays = Math.round(avgApp)
      } else if (hasRej) {
        const avgRej = g.rejectedDays.reduce((a, b) => a + b, 0) / g.rejectedDays.length
        avgDays = Math.round(avgRej)
      }

      computedStats[key] = {
        avgDays: avgDays || defaultVal.avgDays,
        approvalRate: approvalRate ?? defaultVal.approvalRate,
        approvedCount: g.approvedCount,
        rejectedCount: g.rejectedCount,
        totalDecided
      }
    }

    const res = {
      success: true,
      stats: computedStats
    }

    cachedStats = res
    cacheExpiresAt = Date.now() + CACHE_TTL_MS

    return res
  } catch (err: unknown) {
    console.error('[Visa Mode Stats API] Failed to compute stats:', err)
    return {
      success: true,
      stats: DEFAULT_STATS
    }
  }
})
