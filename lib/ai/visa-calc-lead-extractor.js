const axios = require('axios');
const path = require('path');

let config;
try {
    config = require('../../turso.config.js');
} catch (e) {
    config = { OPENAI_API_KEY: '' };
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY;

class VisaCalcLeadExtractor {
    // Reads the whole conversation so far and pulls out whatever the
    // student (and the AI's own computed result) has revealed. Re-extracts
    // from scratch each call (cheap, bounded-length interview) instead of
    // diffing turn-to-turn, so every field always reflects the latest state.
    async extract(history, latestMessage) {
        const transcript = [...history, { role: 'user', content: latestMessage }]
            .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Student'}: ${m.content}`)
            .join('\n');

        const systemPrompt = `You extract D-2 (bachelor) student-visa calculator interview data from a chat transcript between a Korean-university-visa AI assistant and a prospective student.

Return ONLY a JSON object with these fields (use null for anything not mentioned anywhere in the transcript -- never invent or guess a value):
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

Only use information the student or assistant actually stated. Never invent or guess values.`;

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: transcript }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0
                },
                {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            console.error('VisaCalcLeadExtractor Error:', error.message);
            return null;
        }
    }
}

module.exports = new VisaCalcLeadExtractor();
