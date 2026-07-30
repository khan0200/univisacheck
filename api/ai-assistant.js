const axios = require('axios');
const path = require('path');

const ALLOWED_ORIGINS = [
    'https://visa.unibridge.uz',
    'https://visa-sable.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'https://www.salomkorea.uz',
    'https://salomkorea.uz'
];

module.exports = async (req, res) => {
    // CORS
    const origin = req.headers.origin || '*';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        let geminiKey = process.env.GEMINI_API_KEY || '';
        try {
            const tursoConfig = require(path.join(__dirname, '..', 'turso.config.js'));
            if (tursoConfig.GEMINI_API_KEY) geminiKey = tursoConfig.GEMINI_API_KEY;
        } catch (_) {}

        if (!geminiKey) {
            res.status(200).json({
                response: "⚠️ **Gemini API Key Missing**: Please set `GEMINI_API_KEY` in Vercel environment variables or local `turso.config.js` to enable the AI Admission Assistant."
            });
            return;
        }

        const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        const { message, history = [] } = body;

        if (!message) {
            res.status(400).json({ error: 'Missing message parameter' });
            return;
        }

        let unis = {};
        try {
            unis = require(path.join(__dirname, '..', 'universities-db.json'));
        } catch (_) {}

        const systemPrompt = `
You are a highly experienced and friendly South Korea Admission Consultant & Study Abroad Assistant.
Your goal is to guide students on how to study in South Korea, helping them with university selection, admission requirements, scholarships, visas, living in Korea, and document translation/apostille.

DATABASE OF KOREAN UNIVERSITIES:
${JSON.stringify(unis, null, 2)}

CORE GUIDELINES & RULES:
1. ONLY answer questions related to studying in South Korea, university admissions, and student life. If the user asks about other topics (such as general coding, global politics, history of other countries, medical advice, homework, etc.), politely decline by explaining that you are specialized in South Korean university admissions and student life.
2. Rely strictly on the DATABASE OF KOREAN UNIVERSITIES provided above when answering questions about specific universities. If the user asks for details about a university in the database, prioritize that information.
3. NEVER hallucinate or invent university details (tuition, scholarship, majors, requirements) that are not in the database. If details are missing or the university is not in the database, state clearly that you do not have the verified information for that university in your current database and offer general requirements or ask them to check the official university website.
4. Support the conversation in the language the user speaks: English, Uzbek (O'zbekcha), Russian (Русский), or Korean (한국어).
5. Explain concepts clearly. Use markdown tables, bold text, and bullet points. **CRITICAL**: Because the chat window is narrow (400px), tables must be kept extremely simple and narrow. Do NOT include wide text columns like 'Viza tartibi va Imtiyozlari' or long descriptions. Limit tables to 2 or 3 narrow columns max (e.g., University Name and Location, or Tuition and Language) so they do not wrap awkwardly.
6. Provide accurate, concise, and structured guidance.
7. Under AI University Finder: Recommend universities based on preferred major, degree level, language certificates (TOPIK/IELTS), GPA (optional), budget, and city. Always ask follow-up questions if you need more details to make a proper recommendation. Explain why you recommended each university.
8. Explain the document requirements for different visas (D-2 student, D-4 language trainee, E-Visa) and admissions (passport, diploma apostille, bank statement, study plan, etc.).
9. Explain financial rules, parents' income certificates, the $16,000/$13,000 KDB Bank Statement requirement, visa checking processes, and living expenses (part-time jobs, food, SIM card, dorms).
`;

        const contents = history.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
        
        contents.push({
            role: 'user',
            parts: [{ text: message }]
        });

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
            {
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                contents
            }
        );

        const candidate = response.data && response.data.candidates && response.data.candidates[0];
        const aiText = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;

        if (!aiText) {
            throw new Error('Invalid response structure from Gemini API');
        }

        res.status(200).json({ response: aiText });

    } catch (err) {
        console.error('[AI Assistant API Error]:', err.message);
        res.status(500).json({ error: 'AI Assistant failed: ' + err.message });
    }
};
