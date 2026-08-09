const db = require('./db')

// Simple in-memory cache
const cache = new Map()
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

class UniversityService {
  async getUniversityByName(name) {
    if (!name) return null
    let searchName = name.trim()
    const lower = searchName.toLowerCase()
    if (lower === 'bufs') searchName = 'Busan University of Foreign Studies'
    else if (lower === 'hufs') searchName = 'Hankuk University of Foreign Studies'
    else if (lower === 'skku') searchName = 'Sungkyunkwan University'
    else if (lower === 'snu') searchName = 'Seoul National University'
    else if (lower === 'kaist') searchName = 'KAIST'

    const cacheKey = `uni_${searchName.toLowerCase()}`
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data
      }
    }

    let res = await db.execute({
      sql: `SELECT * FROM ai_universities WHERE LOWER(name) LIKE ? OR LOWER(korean_name) LIKE ? LIMIT 1`,
      args: [`%${searchName.toLowerCase()}%`, `%${searchName.toLowerCase()}%`]
    })

    // The intent analyzer (LLM) doesn't reliably return the exact DB
    // form of a name -- it may add/drop "University" or attach an
    // Uzbek suffix ("Sejong universiteti"), which breaks the plain
    // substring LIKE above. Fall back to matching on the distinguishing
    // first word alone (same approach as matchUniversityNamesInText).
    if (res.rows.length === 0) {
      const firstWord = searchName.split(' ')[0]
      if (firstWord && firstWord.length >= 3) {
        res = await db.execute({
          sql: `SELECT * FROM ai_universities WHERE LOWER(name) LIKE ? LIMIT 1`,
          args: [`%${firstWord.toLowerCase()}%`]
        })
      }
    }

    if (res.rows.length === 0) return null

    const uni = res.rows[0]

    // Fetch majors and scholarships
    const majorsRes = await db.execute({
      sql: `SELECT * FROM ai_majors WHERE university_id = ?`,
      args: [uni.id]
    })

    const schRes = await db.execute({
      sql: `SELECT * FROM ai_scholarships WHERE university_id = ?`,
      args: [uni.id]
    })

    const fullUni = {
      ...uni,
      is1Percent: uni.is_1_percent === 1,
      majors: majorsRes.rows.map(r => ({ name: r.name, track: r.track })),
      scholarships: schRes.rows.map(r => ({ cert: r.cert, percent: r.percent }))
    }

    cache.set(cacheKey, { data: fullUni, timestamp: Date.now() })
    return fullUni
  }

  async getUniversitiesForComparison(names) {
    const results = []
    for (const name of names) {
      const uni = await this.getUniversityByName(name)
      if (uni) results.push(uni)
    }
    return results
  }

  // Returns full rows (+ majors/scholarships) for every 1%-accredited
  // university, not just name/qs_rank -- so if the AI is asked a natural
  // follow-up about tuition/language/KDB/majors for one of these, it has
  // the data already in dynamicContext instead of reporting "bazada yo'q"
  // for fields the DB actually has (same bug class as getCollegesForTopikLevel).
  async get1PercentUniversities() {
    const res = await db.execute(`SELECT * FROM ai_universities WHERE is_1_percent = 1`)
    return this._attachMajorsAndScholarships(res.rows)
  }

  // Shared helper: joins ai_majors/ai_scholarships onto a list of full
  // ai_universities rows, matching the shape getUniversityByName returns
  // for a single university.
  async _attachMajorsAndScholarships(rows) {
    const full = []
    for (const uni of rows) {
      const majorsRes = await db.execute({ sql: `SELECT * FROM ai_majors WHERE university_id = ?`, args: [uni.id] })
      const schRes = await db.execute({ sql: `SELECT * FROM ai_scholarships WHERE university_id = ?`, args: [uni.id] })
      full.push({
        ...uni,
        is1Percent: uni.is_1_percent === 1,
        majors: majorsRes.rows.map(r => ({ name: r.name, track: r.track })),
        scholarships: schRes.rows.map(r => ({ cert: r.cert, percent: r.percent }))
      })
    }
    return full
  }

  // For "which universities give more scholarship" style questions --
  // returns universities ranked by their highest scholarship percentage,
  // so the AI can answer with a concrete list instead of asking for a
  // major/direction it doesn't actually need to filter on. `percent` is
  // free text ("100%", "~350,000 KRW / oyiga", prose) so the numeric
  // percentage is extracted and ranked in JS, not SQL.
  async getTopScholarshipUniversities(limit = 12) {
    // Rank by percentage first using the lightweight join (percent is
    // free text -- "100%", "~350,000 KRW / oyiga", prose -- so it's
    // parsed and ranked in JS, not SQL), then fetch full rows only for
    // the winning universities so the AI still has tuition/app_fee/kdb/
    // majors/etc. for them instead of just name/qs_rank/percent (same
    // bug class as the other under-fetching methods here).
    const res = await db.execute(`
            SELECT u.id, s.percent, s.cert
            FROM ai_universities u
            JOIN ai_scholarships s ON s.university_id = u.id
        `)

    const bestByUni = new Map()
    for (const row of res.rows) {
      const match = (row.percent || '').match(/(\d+)\s*%/)
      const pct = match ? parseInt(match[1], 10) : -1
      const existing = bestByUni.get(row.id)
      if (!existing || pct > existing.max_scholarship_percent) {
        bestByUni.set(row.id, { max_scholarship_percent: pct, best_scholarship: row.percent, best_scholarship_cert: row.cert })
      }
    }

    const topIds = [...bestByUni.entries()]
      .filter(([, v]) => v.max_scholarship_percent > 0)
      .sort((a, b) => b[1].max_scholarship_percent - a[1].max_scholarship_percent)
      .slice(0, limit)

    if (topIds.length === 0) return []

    const idList = topIds.map(([id]) => id)
    const placeholders = idList.map(() => '?').join(',')
    const uniRes = await db.execute({
      sql: `SELECT * FROM ai_universities WHERE id IN (${placeholders})`,
      args: idList
    })
    const fullUnis = await this._attachMajorsAndScholarships(uniRes.rows)
    const byId = new Map(fullUnis.map(u => [u.id, u]))

    // Preserve the scholarship-percent ranking order and attach the
    // ranking metadata (max_scholarship_percent etc.) onto the full row.
    return topIds.map(([id, meta]) => ({ ...byId.get(id), ...meta })).filter(Boolean)
  }

  // For "TOPIK 2 bilan qaysi kollejga topshirsa bo'ladi" style questions --
  // returns 2-year college-level institutions whose language requirement is
  // at or below the student's stated TOPIK level, so the AI can answer with
  // a concrete list instead of stalling on a track/type question the
  // database already has enough information to skip.
  // College-tier isn't its own DB column (uni_type is blank for all of
  // them) -- the same "kollej"/"college" signal the index.html frontend
  // filter reads from name/qs_rank/uni_type is used here, mirroring
  // setTopCardsFilter's college branch so the AI and the website page
  // agree on which institutions count as colleges.
  async getCollegesForTopikLevel(topikLevel) {
    const res = await db.execute(`
            SELECT * FROM ai_universities
            WHERE LOWER(name) LIKE '%college%'
               OR LOWER(qs_rank) LIKE '%kollej%' OR LOWER(qs_rank) LIKE '%college%'
               OR LOWER(uni_type) LIKE '%kollej%'
        `)

    let colleges = res.rows
    if (topikLevel) {
      colleges = colleges.filter((u) => {
        const match = (u.language || '').match(/TOPIK\s*(\d)/i)
        const required = match ? parseInt(match[1], 10) : null
        return required === null || required <= topikLevel
      })
    }

    return this._attachMajorsAndScholarships(colleges)
  }

  // Words too generic to safely treat as a university-name signal on their
  // own -- "Seoul"/"Korea" show up constantly in ordinary conversation
  // ("Koreyada o'qish", talk of Seoul the city) with no university meant.
  static GENERIC_NAME_WORDS = new Set(['university', 'seoul', 'korea', 'busan', 'far', 'national'])

  // Cheap in-process match against all known university names -- lets
  // callers detect a mentioned university from raw text without an LLM
  // entity-extraction call (used by the Visa Calculator flow, which skips
  // IntentAnalyzer entirely). Matches on the distinguishing keyword of each
  // name (e.g. "Sejong", "Gachon") as a whole word, rather than the full
  // "X University" string, since students write it with Uzbek suffixes
  // attached ("Sejong universitetiga", "Gachonga") instead of the English
  // form. Skips names whose only distinguishing word is too generic to
  // match safely (e.g. "Seoul National University").
  async matchUniversityNamesInText(text) {
    if (!text) return []
    const cacheKey = 'all_uni_names'
    let names = cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < CACHE_TTL)
      ? cache.get(cacheKey).data
      : null

    if (!names) {
      const res = await db.execute(`SELECT name, korean_name FROM ai_universities`)
      names = res.rows.filter(r => r.name).map((r) => {
        const distinctiveWord = r.name.split(' ').find(w => !UniversityService.GENERIC_NAME_WORDS.has(w.toLowerCase()) && w.length >= 3)
        return { name: r.name, keyword: distinctiveWord || null }
      }).filter(r => r.keyword)
      cache.set(cacheKey, { data: names, timestamp: Date.now() })
    }

    const matched = names.filter(({ keyword }) => new RegExp(`\\b${keyword}`, 'i').test(text))
    // Longest keyword first so a more specific match isn't shadowed by a shorter one.
    return [...new Set(matched.sort((a, b) => b.keyword.length - a.keyword.length).map(m => m.name))].slice(0, 3)
  }
}

module.exports = new UniversityService()
