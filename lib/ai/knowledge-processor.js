const axios = require('axios');
const db = require('../db');

let config;
try {
    config = require('../../turso.config.js');
} catch (e) {
    config = { OPENAI_API_KEY: '' };
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY;

class KnowledgeProcessor {
    async processAndSave(question, answer, adminId) {
        // Use OpenAI to format, improve, and generate metadata
        const systemPrompt = `You are a professional knowledge base metadata generator for a Korean Visa & Admission assistant.
The admin has provided a Q&A pair.
Tasks:
1. Improve the grammar and spelling of the Question to make it professional and searchable.
2. Improve the Answer without changing its meaning or factual data. Make it clear and structured.
3. Generate metadata.

CRITICAL RULE: DO NOT translate the Question or Answer into any other language! Keep the output in the EXACT same language as the input (e.g., if the user provides the question and answer in Uzbek, the improved_question, improved_answer, and keywords/aliases must all be in Uzbek).

Return ONLY a JSON object with this exact structure:
{
    "improved_question": "string",
    "improved_answer": "string",
    "category": "string (e.g. Visa, Admission, General, Scholarship)",
    "topic": "string (e.g. Bank Statement, Apostille, Application)",
    "keywords": ["string"],
    "aliases": ["string", "string"],
    "language": "string (uz, en, ru, ko)"
}`;

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini', // fast model for processing
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Question: ${question}\nAnswer: ${answer}` }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.2
                },
                {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const meta = JSON.parse(response.data.choices[0].message.content);

            // Basic duplicate detection by checking exact question or very similar topic overlap in DB
            const existing = await db.execute({
                sql: `SELECT id, question FROM ai_knowledge WHERE LOWER(question) = ?`,
                args: [meta.improved_question.toLowerCase()]
            });

            if (existing.rows.length > 0) {
                return { 
                    status: 'duplicate', 
                    message: `Duplicate found (ID: ${existing.rows[0].id}). Use /update ${existing.rows[0].id} <new answer> to update.`
                };
            }

            // Save to Turso
            const insert = await db.execute({
                sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by, updated_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
                args: [
                    meta.improved_question,
                    meta.improved_answer,
                    meta.category,
                    meta.topic,
                    JSON.stringify(meta.keywords),
                    JSON.stringify(meta.aliases),
                    meta.language,
                    adminId
                ]
            });

            return {
                status: 'success',
                id: insert.rows[0].id,
                metadata: meta
            };
        } catch (error) {
            console.error("KnowledgeProcessor Error:", error);
            return { status: 'error', message: 'Failed to process and save knowledge.' };
        }
    }
}

module.exports = new KnowledgeProcessor();
