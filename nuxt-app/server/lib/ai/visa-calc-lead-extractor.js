const { loadLocalConfig } = require('../local-config')

async function getOpenAiKey() {
  const config = await loadLocalConfig()
  return process.env.OPENAI_API_KEY || config.OPENAI_API_KEY
}

class VisaCalcLeadExtractor {
  // Extracts from a bounded recent window (last few messages) plus
  // whatever is already saved for this student, instead of resending the
  // entire conversation every turn -- keeps cost flat as the interview
  // grows instead of scaling with total conversation length (O(N^2) fix).
  // `existingLead` is the DB row already known for this phone (or null for
  // a brand-new lead). `recentMessages` is a short window of the latest
  // turns (should include the AI's own current-turn reply, which is where
  // the visa-percentage estimate lives).
  async extract(existingLead, recentMessages) {
    const transcript = recentMessages
      .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Student'}: ${m.content}`)
      .join('\n')

    const knownJson = JSON.stringify(existingLead || {})

    const systemPrompt = `You extract D-2 (bachelor) student-visa calculator interview data from a Korean-university-visa AI assistant's chat with a prospective student.

You are given:
1. "ALREADY KNOWN" -- fields already saved for this student from earlier turns (may be empty/null).
2. "RECENT MESSAGES" -- only the latest part of the conversation (not the full history).

Merge them: for each field, if the recent messages state a value (new or updated), use that; otherwise keep the already-known value as-is. Never blank out an already-known value just because recent messages don't mention it again. Never invent or guess a value that isn't supported by either source.

ALREADY KNOWN:
${knownJson}

Return ONLY a JSON object with these fields (use null for anything never mentioned in either source -- never invent or guess a value):
{
  "phone": "string or null (digits, any format written)",
  "full_name": "string or null",
  "age": "string or null (the student's own age, as a number)",
  "language_certificate": "string or null (current TOPIK/IELTS/TOEFL level, or 'none')",
  "planned_language_certificate": "string or null (certificate the student plans to obtain if they don't have one yet)",
  "university_name": "string or null (a specific Korean university mentioned)",
  "university_type": "string or null ('1_percent', 'standard', or 'not_sure', based on whether the student is applying to a 1%-certified university)",
  "father_official_income": "string or null ('yes', 'no', or 'deceased')",
  "father_monthly_salary": "string or null (approximate amount as stated)",
  "father_house": "string or null ('yes' or 'no' -- owns registered property 3+ months)",
  "father_vehicle": "string or null ('yes' or 'no' -- owns registered vehicle 3+ months)",
  "mother_official_income": "string or null ('yes', 'no', or 'deceased')",
  "mother_monthly_salary": "string or null",
  "mother_house": "string or null ('yes' or 'no')",
  "mother_vehicle": "string or null ('yes' or 'no')",
  "business_info": "string or null (any business/self-employment the parents run: shop, company, farm, rental, etc.)",
  "self_employed_status": "string or null ('yes' or 'no')",
  "grandparents_pension": "string or null ('yes' or 'no')",
  "temp_bank_deposit_availability": "string or null ('yes', 'no', or 'not_sure' -- willing to temporarily hold ~$13,000-15,000 in a parent's bank account)",
  "sponsor_availability": "string or null ('yes' or 'no' -- a close relative with official income who could sponsor)",
  "parent_deceased_status": "string or null (e.g. 'father deceased', 'mother deceased', 'both alive', as applicable)",
  "estimated_visa_approval_percentage": "string or null (ONLY if the Assistant already stated a concrete estimate in the transcript, e.g. 'Above 90%', '72%', copy it verbatim -- do not calculate your own)",
  "ai_generated_comment": "string or null (ONLY if the Assistant already gave a final summary/comment in the transcript, write a short 1-2 sentence paraphrase of it in the same language the conversation used -- do not invent a new one)",
  "parent_income_info": "string or null (a short free-text summary of anything the student said about parents' income/job/business/property, in the language the student used -- kept for backward compatibility)"
}

Only use information the student or assistant actually stated. Never invent or guess values.`

    const userContent = `RECENT MESSAGES:\n${transcript}`

    try {
      const OPENAI_API_KEY = await getOpenAiKey()
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          response_format: { type: 'json_object' },
          temperature: 0
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message || `OpenAI API returned HTTP ${response.status}`)

      return JSON.parse(data.choices[0].message.content)
    } catch (error) {
      console.error('VisaCalcLeadExtractor Error:', error.message)
      return null
    }
  }
}

module.exports = new VisaCalcLeadExtractor()
