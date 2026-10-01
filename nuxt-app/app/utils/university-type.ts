import {
  ONE_PERCENT_UNIVERSITIES,
  ONE_PERCENT_COLLEGES
} from '../data/accredited-universities'
import universitiesData from '../data/universities.json'

const NATIONAL_PATTERNS = [
  'NATIONAL UNIVERSITY',
  'NATIONAL INSTITUTE',
  'UNIVERSITY OF SEOUL',
  'SEOUL NATIONAL',
  'KAIST',
  'GIST',
  'UNIST',
  'DGIST',
  'KENTECH',
  'KOREATECH',
  'KOREA MARITIME',
  'KUMOH NATIONAL',
  'GYEONGNAM GEOCHANG',
  'GYEONGNAM NAMHAE',
  'INCHEON NATIONAL',
  'KOREA NATIONAL'
]

function cleanUniName(name: string): string {
  return (name || '')
    .toUpperCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const cleanOnePercentList = [
  ...ONE_PERCENT_UNIVERSITIES,
  ...ONE_PERCENT_COLLEGES
].map(cleanUniName)

/**
 * Checks if a university qualifies as a "1% Lik universitet".
 */
export function isOnePercentUniversity(name: string): boolean {
  if (!name || !name.trim()) return false
  const rawUpper = name.toUpperCase().trim()
  if (rawUpper.includes('1%') || rawUpper.includes('(1%)')) return true

  const clean = cleanUniName(name)
  if (!clean || clean.length < 4) return false

  for (const op of cleanOnePercentList) {
    if (clean === op || clean.startsWith(op)) {
      return true
    }
  }

  const found = universitiesData.find((u: { name: string; is1Percent?: boolean }) => {
    const uClean = cleanUniName(u.name)
    return clean === uClean || clean.startsWith(uClean)
  })

  return !!found?.is1Percent
}

/**
 * Checks if a university is a "Davlat universiteti" (National / Public).
 */
export function isNationalUniversity(name: string): boolean {
  if (!name || !name.trim()) return false
  const clean = cleanUniName(name)
  if (!clean || clean.length < 4) return false

  for (const pat of NATIONAL_PATTERNS) {
    const patClean = cleanUniName(pat)
    if (clean === patClean || clean.includes(patClean)) {
      return true
    }
  }

  const found = universitiesData.find((u: { name: string; type?: string }) => {
    const uClean = cleanUniName(u.name)
    return clean === uClean || clean.startsWith(uClean)
  })

  return !!(found?.type && found.type.toLowerCase().includes('davlat'))
}

/**
 * Automatically detects and returns the types for a given university.
 * Returns array containing:
 * - '1% Lik universitet' (if applicable)
 * - 'Davlat universiteti' or 'Xususiy universitet'
 */
export function detectUniversityTypes(name: string): string[] {
  if (!name || !name.trim()) return []

  const isOnePercent = isOnePercentUniversity(name)
  const isDavlat = isNationalUniversity(name)

  const result: string[] = []
  if (isOnePercent) {
    result.push('1% Lik universitet')
  }
  if (isDavlat) {
    result.push('Davlat universiteti')
  } else {
    result.push('Xususiy universitet')
  }

  return result
}
