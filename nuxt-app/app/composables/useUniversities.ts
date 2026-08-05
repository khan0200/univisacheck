import type { University } from '~/types/university'

export type ProgramFilter = 'all' | '1percent' | 'master' | 'master-evisa' | 'bachelor' | 'college' | 'language-course' | 'regional'

const COLLEGE_PATTERN = /kollej/i
const LANGUAGE_COURSE_PATTERN = /til\s*kursi|language\s*course/i

/**
 * Universities confirmed to offer a Master's program. Not reliably derivable
 * from englishTrackMasters/koreanTrackMasters alone (only catches 4), so this
 * is an explicit allowlist until the dataset gains a real field for it.
 */
const MASTER_UNIVERSITIES = new Set([
  'Kyung Hee University',
  'Sejong University',
  'Gachon University',
  'Jeonbuk National University',
  'Chungbuk National University',
  'Kangwon National University',
  'Dong-Eui University',
  'Dong-A University',
  'Busan University of Foreign Studies',
  'Anyang University',
  'Hansung University',
  'Namseoul University',
  'Joongbu University'
])

/**
 * Universities confirmed to offer a Master's E-Visa track. Not reliably
 * derivable from visaDetails/statusTag text alone (only catches a handful),
 * so this is an explicit allowlist until the dataset gains a real field for it.
 */
const MASTER_EVISA_UNIVERSITIES = new Set([
  'Gachon University',
  'Jeonbuk National University',
  'Chungbuk National University',
  'Kangwon National University',
  'Dong-Eui University',
  'Dong-A University',
  'Anyang University',
  'Hansung University',
  'Namseoul University',
  'Joongbu University'
])

/**
 * Universities confirmed to offer a language course track. Not derivable
 * from any existing data field — no record's type/badge/statusTag mentions
 * language courses — so this is an explicit allowlist until the dataset
 * gains a real field for it.
 */
const LANGUAGE_COURSE_UNIVERSITIES = new Set([
  'Joongbu University',
  'Hoseo University',
  'Gachon University',
  'Kyung Hee University'
])

/**
 * Universities confirmed to be colleges. Not derivable from any existing
 * data field — no record's type/badge/statusTag mentions "kollej" — so this
 * is an explicit allowlist until the dataset gains a real field for it.
 */
const COLLEGE_UNIVERSITIES = new Set([
  'Inha Technical College',
  'Dong-Eui Institute of Technology',
  'Tongwon University',
  'Kunjang University',
  'Dongwon Institute of Science and Technology',
  'Seoyeong University',
  "Kyungin Women's University",
  'Chosun College of Science & Technology',
  'Induk University',
  'Seojeong University'
])

/** Universities confirmed to carry a "Regional" designation. */
const REGIONAL_UNIVERSITIES = new Set([
  'Dong-Eui Institute of Technology',
  'Hallym University'
])

/** Universities excluded from the catalog entirely (not to be shown as cards). */
const EXCLUDED_UNIVERSITIES = new Set([
  'Dankook University',
  'Dongguk University (Seoul)',
  "Duksung Women's University",
  'Hongik University',
  'Jeju National University',
  'Konyang University',
  'Kyungbok University',
  'Pohang University of Science and Technology (POSTECH)',
  'Pusan National University',
  'Seokyeong University',
  'Seoul Theological University',
  "Seoul Women's University",
  "Sookmyung Women's University",
  'Sungkyul University',
  'Sunmoon University',
  'Ulsan College',
  'Ulsan National Institute of Science and Technology (UNIST)'
])

function hasMasterProgram(u: University): boolean {
  return MASTER_UNIVERSITIES.has(u.name)
}

function hasMasterEvisa(u: University): boolean {
  return MASTER_EVISA_UNIVERSITIES.has(u.name)
}

function hasBachelorProgram(u: University): boolean {
  return Boolean((u.majors && u.majors.length) || (u.englishTrackMajors && u.englishTrackMajors.length) || (u.koreanTrackMajors && u.koreanTrackMajors.length))
}

function isCollege(u: University): boolean {
  if (COLLEGE_UNIVERSITIES.has(u.name)) return true
  return COLLEGE_PATTERN.test(u.type || '') || COLLEGE_PATTERN.test(u.badge1 || '') || COLLEGE_PATTERN.test(u.statusTag || '')
}

function isRegional(u: University): boolean {
  return REGIONAL_UNIVERSITIES.has(u.name)
}

function isLanguageCourse(u: University): boolean {
  if (LANGUAGE_COURSE_UNIVERSITIES.has(u.name)) return true
  return LANGUAGE_COURSE_PATTERN.test(u.type || '') || LANGUAGE_COURSE_PATTERN.test(u.badge1 || '') || LANGUAGE_COURSE_PATTERN.test(u.statusTag || '')
}

/**
 * Extracts a real world-rank number from a qsRank string for sorting (e.g.
 * "TOP 100 (#67 QS 2025)" -> 67, "#1001-1200" -> 1001, "QS #98" -> 98,
 * "TOP 600" -> 600). Category/accreditation labels like "1% Akkreditatsiya
 * (#1 Aviation)" are not real world rankings — the "#1" there means "#1 in
 * Aviation", a specialty rank, not an overall QS/world position — so any
 * string containing "1%" or "Akkred" (accreditation-tier wording) is treated
 * as unranked regardless of digits present. Returns Infinity for entries
 * with no recognizable world rank so they sort last rather than first.
 */
function rankValue(u: University): number {
  const text = u.qsRank || ''
  if (/1%|akkred/i.test(text)) return Infinity
  const hashMatch = text.match(/#(\d+)/)
  if (hashMatch) return Number(hashMatch[1])
  const topMatch = text.match(/TOP\s+(\d+)/i)
  if (topMatch) return Number(topMatch[1])
  return Infinity
}

export interface ProgramBadge {
  key: Exclude<ProgramFilter, 'all'>
  label: string
  class: string
}

/** Program-type chips shown on a UniversityCard, derived from the same rules as the catalog filters. */
export function programBadgesFor(u: University): ProgramBadge[] {
  const badges: ProgramBadge[] = []
  if (u.is1Percent) badges.push({ key: '1percent', label: '1% TOP', class: 'bg-secondary-600 text-primary-950' })
  if (hasBachelorProgram(u)) badges.push({ key: 'bachelor', label: 'Bachelor', class: 'bg-blue-600 text-white' })
  if (hasMasterProgram(u)) badges.push({ key: 'master', label: 'Magistr', class: 'bg-violet-600 text-white' })
  if (hasMasterEvisa(u)) badges.push({ key: 'master-evisa', label: 'Magistr E-Viza', class: 'bg-primary-900 text-white' })
  if (isCollege(u)) badges.push({ key: 'college', label: 'College', class: 'bg-purple-700 text-white' })
  if (isRegional(u)) badges.push({ key: 'regional', label: 'Regional', class: 'bg-teal-600 text-white' })
  if (isLanguageCourse(u)) badges.push({ key: 'language-course', label: 'Language Course', class: 'bg-success-600 text-white' })
  return badges
}

export function useUniversities() {
  const { data, pending, error, refresh } = useAsyncData('universities', () => $fetch<University[]>('/api/universities'), {
    default: () => [] as University[]
  })
  const universities = computed(() => (data.value || []).filter((u) => !EXCLUDED_UNIVERSITIES.has(u.name)))

  const searchQuery = ref('')
  const locationFilter = ref('all')
  const accreditationFilter = ref<ProgramFilter>('all')
  const sortByRank = ref(false)

  const locations = computed(() => {
    const set = new Set(universities.value.map((u) => u.location))
    return ['all', ...[...set].sort()]
  })

  const filtered = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    const result = universities.value.filter((u) => {
      if (locationFilter.value !== 'all' && u.location !== locationFilter.value) return false

      switch (accreditationFilter.value) {
        case '1percent': if (!u.is1Percent) return false; break
        case 'master': if (!hasMasterProgram(u)) return false; break
        case 'master-evisa': if (!hasMasterEvisa(u)) return false; break
        case 'bachelor': if (!hasBachelorProgram(u)) return false; break
        case 'college': if (!isCollege(u)) return false; break
        case 'language-course': if (!isLanguageCourse(u)) return false; break
        case 'regional': if (!isRegional(u)) return false; break
      }

      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) ||
        u.koreanName.toLowerCase().includes(q) ||
        u.location.toLowerCase().includes(q) ||
        u.majors.some((m) => m.toLowerCase().includes(q))
      )
    })

    if (sortByRank.value) {
      return [...result].sort((a, b) => rankValue(a) - rankValue(b))
    }
    return result
  })

  return { universities, pending, error, refresh, searchQuery, locationFilter, accreditationFilter, sortByRank, locations, filtered }
}
