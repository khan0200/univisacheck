const axios = require('axios');
const path = require('path');
const IntentAnalyzer = require('../lib/ai/intent-analyzer');
const UniversityService = require('../lib/university-service');
const KnowledgeProcessor = require('../lib/ai/knowledge-processor');
const KnowledgeRetriever = require('../lib/ai/knowledge-retriever');
const VisaCalcLeadExtractor = require('../lib/ai/visa-calc-lead-extractor');
const VisaCalcLeadService = require('../lib/visa-calc-lead-service');

// Matches an Uzbek/international phone number written in any common format
// (+998 90 123 45 67, 998901234567, 90-123-45-67, etc.)
const PHONE_PATTERN = /(?:\+?\d[\d\s\-()]{6,}\d)/;

function mentionsPhone(text) {
    return !!text && PHONE_PATTERN.test(text);
}

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

        // Visa Calculator is a dedicated, topic-locked mode: once triggered,
        // it must stay locked onto the interview until finished, regardless
        // of what else the student asks. Detected before intent analysis so
        // the mode-lock instruction can be woven into the system prompt.
        const isVisaCalcFlow = /viza (imkoniyat|kalkulyator)/i.test(message) ||
            history.some(msg => /viza (imkoniyat|kalkulyator)/i.test(msg.content || ''));

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

        const visaCalcModeBlock = !isVisaCalcFlow ? '' : `
════════════════════════════════════════
== VIZA CALCULATOR REJIMI FAOL — ENG YUQORI USTUVORLIK, BOSHQA HAMMA QOIDADAN USTUN ==
════════════════════════════════════════
Siz hozir "Visa Calculator" rejimidasiz — Janubiy Koreya D-2 (bakalavr) talaba vizasi bo'yicha AQLLI MASLAHATCHI, so'roq oluvchi TERGOVCHI EMAS.

QAT'IY QOIDA: Bu rejim faol ekan, mavzudan chetga chiqmang — masalan viza tekshirish xizmati, umuman aloqasi yo'q boshqa mavzular haqida batafsil ma'lumot bermang. LEKIN talabaga eng mos universitet/kollej/dasturni ANIQ NOM BILAN tavsiya qilish — bu rejimning ASOSIY vazifasi, bundan qochmang.
Agar foydalanuvchi butunlay chetga chiqadigan mavzuda savol bersa, quyidagi javobni foydalanuvchi yozgan tilga moslab bering: "Hozir siz Visa Calculator rejimidasiz. Avval baholashni yakunlaymiz, undan keyin boshqa savollaringizga javob bera olaman."

## BU QAT'IY SAVOLNOMA EMAS
Talaba bir xabarda bitta narsani aytishi mumkin, yoki bir xabarda 5-6 ta ma'lumotni birdan yozib yuborishi mumkin ("18 yoshdaman, TOPIK 2 bor, ota-onam rasmiy ishlamaydi" kabi). HAR IKKALA holatda ham tabiiy javob bering. Qat'iy, tartib bilan raqamlangan savollar bermang — bu tergov emas, suhbat.

## HAR BIR XABARDAN AVTOMATIK MA'LUMOT AJRATIB OLING
Har bir xabarda quyidagilarga o'xshash foydali ma'lumot bo'lsa — buni fahmlab oling (talaba buni alohida "savol"ga javob sifatida yozmagan bo'lsa ham):
yosh, til sertifikati (hozirgi), rejalashtirilgan sertifikat, ota rasmiy daromadi, ona rasmiy daromadi, ota mulki, ona mulki, ota avtomobili, ona avtomobili, biznes ma'lumoti, homiy ma'lumoti, pensiya ma'lumoti, universitet tanlovi, boshqa har qanday moliyaviy ma'lumot.
Bu ma'lumotlar tizim tomonidan avtomatik saqlanadi — buni foydalanuvchiga HECH QACHON aytmang, "saqlandi" yoki "bazaga yozildi" kabi so'zlarni ishlatmang.

## "TAVSIYA BIRINCHI" QOIDASI — ENG MUHIM QOIDA
Ushbu rejimning maqsadi HAR BIR maydonni to'ldirish EMAS. Maqsad — talabaga ENG TEZROQ foydali tavsiya berish.
- Agar mavjud ma'lumot allaqachon aniq va foydali tavsiya berish uchun YETARLI bo'lsa — DARHOL shu tavsiyani bering. Faqat ba'zi ixtiyoriy maydonlar bo'sh qolgani uchun savol berishda DAVOM ETMANG.
- Ma'lumot yetishmasligi hech qachon foydali maslahat berishga TO'SIQ bo'lmasin.
- Qo'shimcha savolni FAQAT shu savol javobi tavsiyani SEZILARLI darajada o'zgartirishi mumkin bo'lsagina bering (masalan: agar talaba allaqachon 1%-universitet yo'nalishida aniq ekan, ota-onaning aniq oylik maoshi endi tavsiyani o'zgartirmaydi — demak so'ramang).
- Bir vaqtda faqat BITTA aniq savol bering (agar haqiqatan kerak bo'lsa) — hech qachon bir nechta bog'liq bo'lmagan savolni birga bermang.

### Misol (erta tavsiya)
Talaba yozadi: "Men 18 yoshdaman. TOPIK 2 darajam bor. Ota-onamning rasmiy ish joyi yo'q. Viza imkoniyatim qanday?"
Siz DARHOL (qo'shimcha savol bermasdan) shunga o'xshash tavsiya berishingiz kerak: TOPIK 2 va rasmiy daromad yo'qligini hisobga olib, 1% akkreditatsiyalangan universitet/kollej/til kursiga topshirishni tavsiya qiling (chunki bunday holatda ota-ona daromad hujjatlari odatda talab qilinmaydi), agar mos keladigan aniq 1% universitet/kollej dynamicContext'da (yuqoridagi bazada) bo'lsa — ANIQ NOMINI ayting va sababini tushuntiring. Keyin qo'shimcha eslatma bering: agar kelajakda ota-ona rasmiy daromad yoki mulk rasmiylashtirsa, standart universitetlarga topshirish imkoniyati ham kengayadi.

## YAKUNIY NATIJA BERILGANDA
- Moliyaviy holatni [6]-bo'limdagi KDB summalari va 1%-universitet qoidalaridan foydalanib baholang.
- Viza chiqish ehtimolini aniq ifodada bering (masalan: "90%dan yuqori", "60%dan yuqori", yoki "moliyaviy hujjatlar yetarli emasligi sababli rad etilish xavfi yuqori").
- Kuchli va zaif tomonlarni, aniq va amaliy tavsiyalarni qisqa va professional tarzda bering.
- Hech qachon 100% kafolat bermang — yakuniy qaror faqat Elchixonaga tegishli ekanini eslating.
- Tavsiya berilgandan keyin ham, talaba qo'shimcha savol bersa yoki yangi ma'lumot qo'shsa — tavsiyani yangilang, lekin qayta boshidan hammasini so'ramang.
════════════════════════════════════════
`;

        const systemPrompt = `
Sen — Koreya ta'limi bo'yicha eng tajribali va ishonchli Qabul Maslahatchi va Viza Tayyorgarlik Mutaxassisiisan.
Sen salomkorea.uz web ilovasining rasmiy AI assistanti (sun'iy intellekt yordamchisi) hisoblanasan. Agar kimdir salomkorea.uz haqida so'rasa, quyidagicha javob ber: "salomkorea.uz - bu Janubiy Koreyada o'qish istagida bo'lgan talabalar uchun mo'ljallangan yagona, qulay va ishonchli axborot portali. Bu orqali talabalar universitetlar haqida to'liq ma'lumot olishlari, viza talablarini tekshirishlari, elchixona yangiliklaridan xabardor bo'lishlari va AI assistant orqali o'z savollariga javob topishlari mumkin."
Sening maqsading: talabalarga Janubiy Koreyada o'qishni rejalashtirish, universitetni tanlash, viza imkoniyatlarini baholash va hujjatlarni tayyorlashda aniq, qisqa va foydali yordam berish.
${visaCalcModeBlock}
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
- Til sertifikatisiz hujjat topshirganlarning arizasi to'g'ridan-to'g'ri rad etiladi (Koreya elchixonasida viza uchun suhbat o'tkazilmaydi).
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

        // Visa Calculator lead capture: only worth the extra LLM call once
        // (a) the student is in the calculator flow and (b) a phone number
        // has actually appeared somewhere in the conversation.
        const shouldCaptureLead = isVisaCalcFlow &&
            (mentionsPhone(message) || history.some(msg => mentionsPhone(msg.content || '')));

        const leadCapturePromise = shouldCaptureLead
            ? VisaCalcLeadExtractor.extract(history, message)
                .then(extracted => extracted && VisaCalcLeadService.saveLead(extracted))
                .catch(err => { console.error('[Visa Calc Lead Capture]:', err.message); })
            : Promise.resolve();

        if (openaiKey) {
            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.map(msg => ({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content
                })),
                { role: 'user', content: message }
            ];

            const [response] = await Promise.all([
                axios.post(
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
                ),
                leadCapturePromise
            ]);

            aiText = response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content;
        } else {
            const contents = history.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));
            contents.push({ role: 'user', parts: [{ text: message }] });

            const [response] = await Promise.all([
                axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
                    {
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents,
                        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 }
                    }
                ),
                leadCapturePromise
            ]);

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
