const db = require('../db')

function stemUzbek(word) {
  const suffixes = [
    'laringiz', 'larimiz',
    'larning', 'laridan', 'lariga', 'larida', 'larini',
    'sining', 'simiz', 'sigiz', 'sidan', 'siga', 'sida', 'sini',
    'ining', 'imiz', 'ingiz', 'lar',
    'idan', 'iga', 'ida', 'ini', 'ning',
    'dan', 'ga', 'da', 'ni', 'im', 'ing',
    'si', 'i'
  ]
  let stemmed = word
  for (const suffix of suffixes) {
    if (stemmed.endsWith(suffix) && stemmed.length - suffix.length >= 3) {
      stemmed = stemmed.substring(0, stemmed.length - suffix.length)
      break
    }
  }
  return stemmed
}

class KnowledgeRetriever {
  async retrieve(intent, keywords = [], originalMessage = '') {
    // Parse message into clean search words with Uzbek stemming
    const words = originalMessage.split(/[^\wа-яёўқғҳa-z0-9%']+/i)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 3)
      .map(w => stemUzbek(w))

    let scoreExpressions = []
    let queryParams = []

    // Base category match score
    if (intent && intent !== 'other') {
      scoreExpressions.push(`(CASE WHEN LOWER(category) = ? THEN 3 ELSE 0 END)`)
      queryParams.push(intent.toLowerCase())
    } else {
      scoreExpressions.push(`0`)
    }

    // Add scores for each keyword match
    for (const word of words) {
      const pattern = `%${word}%`
      scoreExpressions.push(`(CASE WHEN LOWER(question) LIKE ? THEN 10 ELSE 0 END)`)
      scoreExpressions.push(`(CASE WHEN LOWER(aliases) LIKE ? THEN 5 ELSE 0 END)`)
      scoreExpressions.push(`(CASE WHEN LOWER(keywords) LIKE ? THEN 3 ELSE 0 END)`)
      queryParams.push(pattern, pattern, pattern)
    }

    const scoreSql = scoreExpressions.join(' + ')
    const sql = `
            SELECT * FROM (
                SELECT id, question, answer, category, (${scoreSql}) as score 
                FROM ai_knowledge 
                WHERE is_active = 1
            )
            WHERE score > 0
            ORDER BY score DESC, id DESC
            LIMIT 3
        `

    try {
      const res = await db.execute({ sql, args: queryParams })
      return res.rows.map(r => ({
        question: r.question,
        answer: r.answer,
        category: r.category,
        score: r.score
      }))
    } catch (error) {
      console.error('KnowledgeRetriever Error:', error)
      return []
    }
  }
}

module.exports = new KnowledgeRetriever()
