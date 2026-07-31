const axios = require('axios');
const path = require('path');
const IntentAnalyzer = require('../lib/ai/intent-analyzer');
const UniversityService = require('../lib/university-service');
const KnowledgeProcessor = require('../lib/ai/knowledge-processor');
const KnowledgeRetriever = require('../lib/ai/knowledge-retriever');

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
        let openaiKey = process.env.OPENAI_API_KEY || '';
        let geminiKey = process.env.GEMINI_API_KEY || '';
        try {
            const tursoConfig = require(path.join(__dirname, '..', 'turso.config.js'));
            if (tursoConfig.OPENAI_API_KEY) openaiKey = tursoConfig.OPENAI_API_KEY;
            if (tursoConfig.GEMINI_API_KEY) geminiKey = tursoConfig.GEMINI_API_KEY;
        } catch (_) {}

        if (!openaiKey && !geminiKey) {
            res.status(200).json({
                response: "⚠️ **API Key Missing**: Please set `OPENAI_API_KEY` or `GEMINI_API_KEY` to enable the AI Admission Assistant."
            });
            return;
        }

        const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        const { message, history = [] } = body;

        if (!message) {
            res.status(400).json({ error: 'Missing message parameter' });
            return;
        }

        // Configuration and Secrets
        let adminSecret = process.env.ADMIN_SECRET || 'secret_admin_123';
        try {
            const tursoConfig = require(path.join(__dirname, '..', 'turso.config.js'));
            if (tursoConfig.ADMIN_SECRET) adminSecret = tursoConfig.ADMIN_SECRET;
        } catch (_) {}

        // Admin Session & Authentication
        let isAdmin = false;
        if (message.startsWith('/login ')) {
            const token = message.split(' ')[1];
            if (token === adminSecret) {
                res.status(200).json({ response: "✅ **Admin tizimga kirdi!** Endi `/savol`, `/javob` buyruqlaridan foydalanishingiz mumkin." });
                return;
            }
        }
        
        for (const msg of history) {
            if (msg.role === 'user' && msg.content.startsWith('/login ')) {
                const token = msg.content.split(' ')[1];
                if (token === adminSecret) isAdmin = true;
            }
        }

        if (isAdmin) {
            if (message.startsWith('/savol ')) {
                res.status(200).json({ response: "✅ **Savol qabul qilindi.** Endi iltimos, javobni `/javob <matn>` shaklida yuboring." });
                return;
            } else if (message.startsWith('/javob ')) {
                let lastSavol = null;
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].role === 'user' && history[i].content.startsWith('/savol ')) {
                        lastSavol = history[i].content.replace('/savol ', '').trim();
                        break;
                    }
                }
                
                if (!lastSavol) {
                    res.status(200).json({ response: "❌ Xatolik: Oldingi `/savol` topilmadi." });
                    return;
                }
                
                const answer = message.replace('/javob ', '').trim();
                const result = await KnowledgeProcessor.processAndSave(lastSavol, answer, "admin");
                
                if (result.status === 'success') {
                    res.status(200).json({ 
                        response: `✅ **Ma'lumot saqlandi!** (ID: ${result.id})\n\n**Savol:** ${result.metadata.improved_question}\n**Javob:** ${result.metadata.improved_answer}\n**Teglar:** ${result.metadata.keywords.join(', ')}`
                    });
                } else {
                    res.status(200).json({ response: `ℹ️ **Natija:** ${result.message}` });
                }
                return;
            }
        }

        // 1. Analyze Intent
        const analysis = await IntentAnalyzer.analyze(message);
        console.log("Intent Analysis:", analysis);

        // 2. Fetch Relevant Data dynamically from Turso
        let dynamicContext = "";
        let isPureFactual = analysis.intent === 'factual_lookup' && analysis.attribute && analysis.entities.length === 1;

        // Fetch university data if mentioned
        if (analysis.entities && analysis.entities.length > 0) {
            const unis = await UniversityService.getUniversitiesForComparison(analysis.entities);
            if (unis && unis.length > 0) {
                if (isPureFactual) {
                    const uni = unis[0];
                    const attr = analysis.attribute;
                    let answer = "";
                    if (attr === 'tuition') answer = `${uni.name} kontrakt narxi: ${uni.tuition}`;
                    else if (attr === 'app_fee') answer = `${uni.name} application fee: ${uni.app_fee}`;
                    else if (attr === 'location') answer = `${uni.name} joylashuvi: ${uni.location}, ${uni.address}`;
                    else if (attr === 'qs_rank') answer = `${uni.name} QS reytingi: ${uni.qs_rank}`;
                    else if (attr === 'language') answer = `${uni.name} til talabi: ${uni.language}`;
                    else isPureFactual = false; // fallback

                    if (isPureFactual && answer) {
                        res.status(200).json({ response: answer });
                        return;
                    }
                }
                dynamicContext += `\n== RELEVANT UNIVERSITIES DATA ==\n${JSON.stringify(unis, null, 2)}\n== END RELEVANT DATA ==\n`;
            }
        }

        // Fetch 1% list if user asks for it
        if (message.includes('1%') || message.toLowerCase().includes('yengil') || (analysis.intent === 'university_info' && analysis.entities.length === 0)) {
            const onePercentUnis = await UniversityService.get1PercentUniversities();
            if (onePercentUnis && onePercentUnis.length > 0) {
                dynamicContext += `\n== 1% (YENGILLASHTIRILGAN) UNIVERSITETLAR RO'YXATI (DATABASE) ==\n`;
                onePercentUnis.forEach((u, i) => {
                    dynamicContext += `${i+1}. ${u.name} (${u.korean_name}) - ${u.qs_rank || 'Top'}\n`;
                });
                dynamicContext += `\n== TUGADI ==\n`;
            }
        }

        // Fetch KMS Knowledge base content
        const kmsRecords = await KnowledgeRetriever.retrieve(analysis.intent, analysis.keywords, message);
        if (kmsRecords && kmsRecords.length > 0) {
            dynamicContext += `\n== BAZADAGI QO'SHIMCHA MA'LUMOTLAR ==\n` + kmsRecords.map(r => `Savol: ${r.question}\nJavob: ${r.answer}`).join('\n\n') + `\n== BAZA TUGADI ==\n`;
        }

        const systemPrompt = `
Sen — Koreya ta'limi bo'yicha eng tajribali va ishonchli Qabul Maslahatchi va Viza Tayyorgarlik Mutaxassisiisan.
Sen salomkorea.uz web ilovasining rasmiy AI assistanti (sun'iy intellekt yordamchisi) hisoblanasan. Agar kimdir salomkorea.uz haqida so'rasa, quyidagicha javob ber: "salomkorea.uz - bu Janubiy Koreyada o'qish istagida bo'lgan talabalar uchun mo'ljallangan yagona, qulay va ishonchli axborot portali. Bu orqali talabalar universitetlar haqida to'liq ma'lumot olishlari, viza talablarini tekshirishlari, elchixona yangiliklaridan xabardor bo'lishlari va AI assistant orqali o'z savollariga javob topishlari mumkin."
Sening maqsading: talabalarga Janubiy Koreyada o'qishni rejalashtirish, universitetni tanlash, viza imkoniyatlarini baholash va hujjatlarni tayyorlashda aniq, qisqa va foydali yordam berish.

${dynamicContext}

════════════════════════════════════════
== QISM 1: ASOSIY MASLAHAT QOIDALARI ==
════════════════════════════════════════

[1] FAQAT KOREYA TA'LIMI HAQIDA GAPLASH
Boshqa mavzular (kodlash, tibbiyot, siyosat, uy vazifalari) so'ralsa — xushmuomalalik bilan rad et.

[2] MA'LUMOTLAR BAZASIDAN FOYDALANISH — MAJBURIY
- Universitet so'ralsa: FAQAT yuqoridagi bazadagi ma'lumotlarni ishlat — tuition, appFee, language, scholarships, majors, visaStatus, kdb1DayAfterAdmission — barchasini AYNAN yoz.
- Bazada yo'q ma'lumotni HECH QACHON o'ylab topma. Bazada bo'lmasa — ochiq ayt, rasmiy saytni tavsiya qil.
- **1% (YENGILLASHTIRILGAN) UNIVERSITETLAR RO'YXATI**: Ushbu universitetlar ro'yxati bazadan olinadi (dynamicContext-ga qara). Boshqa barcha universitetlar STANDART VIZA TEKSHIRUVI guruhiga kiradi. Ularni HECH QACHON 1% yengillashtirilgan deb atama!

[3] QISQA VA ANIQ JAVOB BER
- Keraksiz kirish so'zlarisiz — to'g'ridan-to'g'ri javob.
- Bullet points va bold matn ishlat.
- Jadvallar: faqat 2-3 ustun, uzoq matnli ustunlar QO'SHMA.

[4] TIL MOSLASHUVI
Foydalanuvchi qaysi tilda yozsa — o'sha tilda javob ber: O'zbek, Rus, Ingliz yoki Koreys.

[5] MASLAHATCHI SIFATIDA HARAKAT QIL
- TOPIK/IELTS darajasi, byudjet, shahar, yo'nalishga qarab universitetlar tavsiya qil va sababini tushuntir.
- Yetarli ma'lumot bo'lmasa — qo'shimcha savol ber.

[6] MUHIM VIZA MA'LUMOTLARI (2026.01.06 ELCHIXONA QOIDALARI)
- 1% Universitetlar (우수인증대): Moliyaviy hujjatlar (KDB, ota-ona daromadi) TALAB ETILMAYDI, lekin til sertifikati shart.
- Standart Universitetlar uchun Talabaning O'z KDB Bank hisobi:
  * D-4 (Til kursi, 3 oy saqlash): Poytaxt (Seoul/Incheon/Gyeonggi) - $7,800. Boshqa hududlar - $6,300.
  * D-2 (Bakalavr/Magistr, 1 oy saqlash): Poytaxt - $15,500. Boshqa hududlar - $12,500.
  * Quyi darajadagi (Consulting) universitetlar: KDB 6 oy saqlanishi shart.
  * KDB guvohnomasi elchixonaga topshirishdan 30 kun ichida olingan bo'lishi kerak.
- Til talabisiz hujjat topshirganlar suhbatsiz rad etiladi.
- D-2: to'liq kunduzgi. D-4: til kursi. E-Viza: magistr (haftada 1 kun).
- Asosiy hujjatlar: pasport, diplom (apostil), transkript, o'quv rejasi, bank ko'chirmasi, foto, ariza.

[7] UNIVERSITET JAVOB FORMATI
🏫 **[Nomi]**
📍 [Joylashuv] | 🏛 [Turi]
📊 [QS Reyting] | 📅 [Tashkil etilgan]
💰 Kontrakt: [narx]
🌐 Til: [TOPIK/IELTS]
🎓 Stipendiyalar: [foiz — bullet bilan]
📋 Yo'nalishlar: [ro'yxat]
🛂 Viza: [1% yoki Standart]
💳 KDB (Qabuldan keyin): [miqdor]

════════════════════════════════════════════════════════
## AI UCHUN MAXSUS QOIDALAR
- Hech qachon soxta hujjat qilishni maslahat bermang.
- Ma'lumotlarni yashirishni yoki aylanib o'tishni o'rgatmang.
- Oila a'zolarining immigratsion tarixini yashirishni maslahat bermang.
- Viza aniq chiqishiga yoki aniq otkaz bo'lishiga hech qachon kafolat bermang.
- Yakuniy qaror faqat Elchixona yoki Koreya Immigratsiyasiga tegishli ekanligini doim eslatib o'ting.



`;       let aiText = '';

        if (openaiKey) {
            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.map(msg => ({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content
                })),
                { role: 'user', content: message }
            ];

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-5.4-nano-2026-03-17',
                    messages,
                    temperature: 0.4,
                    max_completion_tokens: 2048
                },
                {
                    headers: {
                        'Authorization': `Bearer ${openaiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            aiText = response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content;
        } else {
            const contents = history.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));
            contents.push({ role: 'user', parts: [{ text: message }] });

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
                {
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents,
                    generationConfig: { maxOutputTokens: 2048, temperature: 0.4 }
                }
            );

            const candidate = response.data && response.data.candidates && response.data.candidates[0];
            aiText = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
        }

        if (!aiText) {
            throw new Error('Invalid response structure from AI API');
        }

        res.status(200).json({ response: aiText });

    } catch (err) {
        const apiError = err.response && err.response.data && err.response.data.error ? (err.response.data.error.message || JSON.stringify(err.response.data.error)) : err.message;
        console.error('[AI Assistant API Error]:', apiError);
        res.status(500).json({ error: 'AI Assistant failed: ' + apiError });
    }
};
