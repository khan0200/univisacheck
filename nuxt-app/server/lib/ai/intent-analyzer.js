const { loadLocalConfig } = require('../local-config')

async function getOpenAiKey() {
  const config = await loadLocalConfig()
  return process.env.OPENAI_API_KEY || config.OPENAI_API_KEY
}

class IntentAnalyzer {
  async analyze(message) {
    // Fast LLM call to determine intent and entities
    const systemPrompt = `You are an intent analyzer for a Korean University Admission Assistant.
Analyze the user's message and return a JSON object with:
- "intent": One of ["university_info", "compare", "scholarship", "tuition", "visa_calc", "factual_lookup", "general_advice", "other"]
- "entities": Array of university names mentioned.
- "attribute": If factual_lookup, what are they asking? (e.g. "tuition", "app_fee", "deadline", "location"). Otherwise null.
- "visa_related": boolean

Output JSON ONLY.`

    try {
      const OPENAI_API_KEY = await getOpenAiKey()
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5.4-nano-2026-03-17', // Fast and cheap model
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          response_format: { type: 'json_object' },
          temperature: 0
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message || `OpenAI API returned HTTP ${response.status}`)

      const content = data.choices[0].message.content
      return JSON.parse(content)
    } catch (error) {
      console.error('Intent Analyzer Error:', error.message)
      // Fallback strategy if API fails
      return {
        intent: 'other',
        entities: [],
        attribute: null,
        visa_related: false
      }
    }
  }
}

module.exports = new IntentAnalyzer()
