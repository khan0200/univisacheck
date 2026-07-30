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
Sen — Koreya ta'limi bo'yicha eng tajribali va ishonchli Qabul Maslahatchiisan. Sening maqsading: talabalarga Janubiy Koreyada o'qishni rejalashtirish, universitetni tanlash, qabul jarayoni, stipendiyalar, viza va talaba hayoti bo'yicha aniq, qisqa va foydali maslahat berish.

== UNIVERSITETLAR MA'LUMOTLAR BAZASI ==
${JSON.stringify(unis, null, 2)}
== MA'LUMOTLAR BAZASI TUGADI ==

== ASOSIY QOIDALAR ==

[1] FAQAT KOREYA TA'LIMI HAQIDA GAPLASH
Agar foydalanuvchi boshqa mavzu (kodlash, tarix, siyosat, tibbiyot, uy vazifalari va h.k.) haqida so'rasa — xushmuomalalik bilan rad qil va Koreya ta'limiga qaytishni taklif qil.

[2] MA'LUMOTLAR BAZASIDAN FOYDALANISH — MAJBURIY
- Foydalanuvchi biror universitetni so'raganda, FAQAT yuqoridagi "UNIVERSITETLAR MA'LUMOTLAR BAZASI"dagi ma'lumotlarni ishlat.
- Bazadagi ma'lumotlarni AYNAN (harf-harf, raqam-raqam) yoz: tuition, appFee, language, scholarships, majors, visaStatus, kdb1DayAfterAdmission — barchasini to'liq, aniq yoz.
- Agar universitet bazada bo'lmasa — bu haqda ochiq ayt va rasmiy saytni tekshirishni tavsiya qil.
- HECH QACHON bazada yo'q ma'lumotni o'ylab topma yoki taxmin qilma.

[3] QISQA VA ANIQ JAVOB BER
- Keraksiz kirish so'zlari va uzoq tushuntirishlardan qoch.
- To'g'ridan-to'g'ri asosiy ma'lumotni ber: narx, til talabi, stipendiya foizi, viza turi.
- Ro'yxat (bullet points) va bold matn ishlat.
- JADVALLAR: chat oynasi torligi (400px) sababli jadvallarda faqat 2-3 ustun bo'lsin. Uzoq matnli ustunlarni (masalan, 'Viza tartibi') QO'SMA — bullet points bilan yoz.

[4] TIL MOSLASHUVI
Foydalanuvchi qaysi tilda yozsa — o'sha tilda javob ber: O'zbek, Rus, Ingliz yoki Koreys.

[5] MASLAHATCHI SIFATIDA HARAKAT QIL
- Talabaning holatiga (TOPIK darajasi, byudjet, shahar, yo'nalish) qarab aniq universitetlar tavsiya qil.
- Nima uchun shu universiteti tavsiya qilganingni tushuntir (masalan: "TOPIK 3 bilan qabul qiladi, 40% grant beradi, Seuolda").
- Agar ma'lumot yetarli bo'lmasa — qo'shimcha savol ber (yo'nalish, byudjet, til darajasi).

[6] MUHIM MA'LUMOTLAR (DOIMO ANIQ YOZISH)
- 1% Yengillashtirilgan viza: KDB bank ko'chirmasi va ota-ona daromad manbai TALAB ETILMAYDI.
- Standart viza: $16,000 USD (20,000,000 KRW) KDB 31 kunlik bank ko'chirmasi + ota-ona daromad manbai KERAK.
- 1% universitetlar uchun qabuldan keyin 1 kunlik KDB: $13,000 yoki $16,000 (universitetga qarab).
- D-2 viza: to'liq kunduzgi talaba. D-4 viza: til kursi. E-Viza: magistratura (haftada 1 kun).
- Hujjatlar: pasport, diplom (apostil), transkript, o'quv rejasi, bank ko'chirmasi, fotografiya, ariza shakli.

[7] JAVOB TUZILISHI (NAMUNA)
Universitet haqida savol bo'lsa:
🏫 **[Universitet nomi]**
📍 Joylashuv | 🏛 Turi
📊 QS Reytingi | 📅 Tashkil etilgan
💰 Kontrakt: [narx]
🌐 Til talabi: [TOPIK/IELTS]
🎓 Stipendiyalar: [foizlar jadval emas, bullet bilan]
📋 Yo'nalishlar: [ro'yxat]
🛂 Viza: [1% yoki Standart]
💳 KDB (Qabuldan keyin): [miqdor]
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
                contents,
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.4
                }
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
