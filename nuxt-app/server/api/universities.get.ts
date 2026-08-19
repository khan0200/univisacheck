import { getTursoClient } from '../utils/turso'
import cosmeticData from '../data/universities-cosmetic.json'

interface CosmeticEntry {
  img?: string
  badge1?: string
  badge2?: string
  badge1Class?: 'badge-blue' | 'badge-gold' | 'badge-green'
  brandColor?: string
  statusTag?: string
  programs?: string
  bachelorScholarships?: { cert: string, percent: string }[]
  masterScholarships?: { cert: string, percent: string }[]
}

const cosmeticByName = new Map<string, CosmeticEntry>(
  Object.values(cosmeticData as Record<string, CosmeticEntry & { name: string }>).map(u => [u.name, u])
)

interface UniversityRow {
  id: string
  name: string
  korean_name: string
  location: string
  address: string
  qs_rank: string
  founded: string
  tuition: string
  app_fee: string
  language: string
  is_1_percent: number
  visa_status: string
  kdb_amount: string
  description: string
  other_grants_note: string
  uni_type: string
  visa_details: string
}

interface MajorRow {
  university_id: string
  name: string
  track: 'english' | 'korean' | 'english_master' | 'korean_master'
}

interface ScholarshipRow {
  university_id: string
  cert: string
  percent: string
}

let cachedResponse: Record<string, unknown>[] | null = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes in-memory

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    'CDN-Cache-Control': 'public, s-maxage=86400',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=86400'
  })

  const now = Date.now()
  const query = getQuery(event)
  if (!import.meta.dev && cachedResponse && now < cacheExpiresAt && !query.fresh) {
    return cachedResponse
  }

  const db = await getTursoClient()
  const [universitiesResult, majorsResult, scholarshipsResult] = await Promise.all([
    db.execute('SELECT * FROM ai_universities ORDER BY name'),
    db.execute('SELECT university_id, name, track FROM ai_majors'),
    db.execute('SELECT university_id, cert, percent FROM ai_scholarships')
  ])

  const majorsByUniversity = new Map<string, MajorRow[]>()
  for (const row of majorsResult.rows as unknown as MajorRow[]) {
    const list = majorsByUniversity.get(row.university_id) || []
    list.push(row)
    majorsByUniversity.set(row.university_id, list)
  }

  const scholarshipsByUniversity = new Map<string, ScholarshipRow[]>()
  for (const row of scholarshipsResult.rows as unknown as ScholarshipRow[]) {
    const list = scholarshipsByUniversity.get(row.university_id) || []
    list.push(row)
    scholarshipsByUniversity.set(row.university_id, list)
  }

  const result = (universitiesResult.rows as unknown as UniversityRow[]).map((row) => {
    const majors = majorsByUniversity.get(row.id) || []
    const scholarships = (scholarshipsByUniversity.get(row.id) || []).map(s => ({ cert: s.cert, percent: s.percent }))
    const cosmetic = cosmeticByName.get(row.name) || {}

    const englishTrackMajors = majors.filter(m => m.track === 'english').map(m => m.name)
    const koreanTrackMajors = majors.filter(m => m.track === 'korean').map(m => m.name)
    const englishTrackMasters = majors.filter(m => m.track === 'english_master').map(m => m.name)
    const koreanTrackMasters = majors.filter(m => m.track === 'korean_master').map(m => m.name)

    return {
      name: row.name,
      koreanName: row.korean_name,
      type: row.uni_type,
      visaDetails: row.visa_details,
      location: row.location,
      address: row.address,
      img: cosmetic.img || '',
      qsRank: row.qs_rank,
      founded: row.founded,
      programs: cosmetic.programs || '',
      badge1: cosmetic.badge1 || '',
      badge2: cosmetic.badge2 || '',
      badge1Class: cosmetic.badge1Class || 'badge-blue',
      brandColor: cosmetic.brandColor || '#0f3b82',
      statusTag: cosmetic.statusTag || '',
      is1Percent: Boolean(row.is_1_percent),
      tuition: row.tuition,
      appFee: row.app_fee,
      language: row.language,
      visaStatus: row.visa_status,
      kdb1DayAfterAdmission: row.kdb_amount,
      description: row.description,
      englishTrackMajors,
      koreanTrackMajors,
      ...(englishTrackMasters.length ? { englishTrackMasters } : {}),
      ...(koreanTrackMasters.length ? { koreanTrackMasters } : {}),
      majors: [...englishTrackMajors, ...koreanTrackMajors],
      scholarships,
      ...(cosmetic.bachelorScholarships ? { bachelorScholarships: cosmetic.bachelorScholarships } : {}),
      ...(cosmetic.masterScholarships ? { masterScholarships: cosmetic.masterScholarships } : {}),
      otherGrantsNote: row.other_grants_note
    }
  })

  cachedResponse = result
  cacheExpiresAt = Date.now() + CACHE_TTL_MS

  return result
})
