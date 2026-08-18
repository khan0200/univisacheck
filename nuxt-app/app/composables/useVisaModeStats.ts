import type { VisaType } from '~/types/visa-check'

export interface VisaModeStat {
  avgDays: number
  approvalRate: number
  approvedCount: number
  rejectedCount: number
  totalDecided: number
}

export const DEFAULT_VISA_STATS: Record<VisaType, VisaModeStat> = {
  'Embassy': { avgDays: 18, approvalRate: 81, approvedCount: 47, rejectedCount: 11, totalDecided: 58 },
  'E-Visa': { avgDays: 18, approvalRate: 82, approvedCount: 14, rejectedCount: 3, totalDecided: 17 },
  'Regional': { avgDays: 25, approvalRate: 100, approvedCount: 1, rejectedCount: 0, totalDecided: 1 }
}

export function useVisaModeStats() {
  const { data } = useFetch<{ success: boolean, stats: Record<string, VisaModeStat> }>('/api/visa-mode-stats', {
    lazy: true,
    server: true,
    default: () => ({ success: true, stats: DEFAULT_VISA_STATS })
  })

  function getStats(visaType?: VisaType | string | null): VisaModeStat {
    const key = (visaType || 'Embassy') as VisaType
    if (data.value?.stats && data.value.stats[key]) {
      return data.value.stats[key]
    }
    return DEFAULT_VISA_STATS[key] || DEFAULT_VISA_STATS['Embassy']
  }

  return {
    statsMap: computed(() => data.value?.stats || DEFAULT_VISA_STATS),
    getStats
  }
}
