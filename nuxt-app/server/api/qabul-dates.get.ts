import admissionDates from '../data/qabul-dates.json'

interface AdmissionDate {
  id: string
  university_uz: string
  university_en: string
  university_kr: string
  category_uz: string
  category_en: string
  program_type: string
  application_start: string
  application_end: string
  region: string
  establishment: string
  status: string
  platform: string
  url: string
  details_uz: string
  is_hot: boolean
}

const ADMISSION_DATES = admissionDates as AdmissionDate[]

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    'CDN-Cache-Control': 'public, s-maxage=86400',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=86400'
  })

  const query = getQuery(event)
  const search = String(query.search || '').toLowerCase()
  const status = query.status ? String(query.status) : ''
  const platform = query.platform ? String(query.platform) : ''
  const program = query.program ? String(query.program) : ''

  let filtered = ADMISSION_DATES

  if (search) {
    filtered = filtered.filter(item =>
      item.university_uz.toLowerCase().includes(search)
      || item.university_en.toLowerCase().includes(search)
      || item.university_kr.toLowerCase().includes(search)
      || item.category_uz.toLowerCase().includes(search)
      || item.region.toLowerCase().includes(search)
    )
  }

  if (status && status !== 'all') {
    filtered = filtered.filter(item => item.status.toLowerCase() === status.toLowerCase())
  }

  if (platform && platform !== 'all') {
    filtered = filtered.filter(item => item.platform.toLowerCase().includes(platform.toLowerCase()))
  }

  if (program && program !== 'all') {
    filtered = filtered.filter(item => item.program_type.includes(program))
  }

  return {
    success: true,
    total: ADMISSION_DATES.length,
    stats: {
      accepting: ADMISSION_DATES.filter(i => i.status === 'Accepting').length,
      deadline: ADMISSION_DATES.filter(i => i.status === 'Deadline').length,
      scheduled: ADMISSION_DATES.filter(i => i.status === 'Scheduled').length,
      uway_count: ADMISSION_DATES.filter(i => i.platform === 'Uway Apply').length,
      jinhak_count: ADMISSION_DATES.filter(i => i.platform === 'Jinhak Apply').length
    },
    data: filtered,
    updatedAt: new Date().toISOString()
  }
})
