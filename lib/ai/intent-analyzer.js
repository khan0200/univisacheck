const axios = require('axios');
const path = require('path');

let config;
try {
    config = require('../../turso.config.js');
} catch (e) {
    config = { OPENAI_API_KEY: '' };
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY;

class IntentAnalyzer {
    async analyze(message) {
        // Fast LLM call to determine intent and entities
        const systemPrompt = `You are an intent analyzer for a Korean University Admission Assistant.
Analyze the user's message and return a JSON object with:
- "intent": One of ["university_info", "compare", "scholarship", "tuition", "visa_calc", "factual_lookup", "general_advice", "other"]
- "entities": Array of university names mentioned.
- "attribute": If factual_lookup, what are they asking? (e.g. "tuition", "app_fee", "deadline", "location"). Otherwise null.
- "visa_related": boolean

Output JSON ONLY.`;

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-5.4-nano-2026-03-17', // Fast and cheap model
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0
                },
                {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const content = response.data.choices[0].message.content;
            return JSON.parse(content);
        } catch (error) {
            console.error("Intent Analyzer Error:", error.message);
            // Fallback strategy if API fails
            return {
                intent: "other",
                entities: [],
                attribute: null,
                visa_related: false
            };
        }
    }
}

module.exports = new IntentAnalyzer();
