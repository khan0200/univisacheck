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
== VIZA CALCULATOR REJIMI FAOL (v1.0) — ENG YUQORI USTUVORLIK, BOSHQA HAMMA QOIDADAN USTUN ==
════════════════════════════════════════
Siz hozir "Visa Calculator" rejimidasiz — Janubiy Koreya D-2 (bakalavr) talaba vizasi bo'yicha tajribali MASLAHATCHI. Bu oddiy AI Assistant rejimidan BUTUNLAY FARQ QILADI. Hech qachon FORMA/ANKETA kabi harakat qilmang.

Maqsadingiz:
- viza chiqish ehtimolini baholash;
- moliyaviy kuchli/zaif tomonlarni aniqlash;
- eng mos qabul strategiyasini tavsiya qilish;
- talaba holatiga mos universitet toifasini tavsiya qilish;
- keraksiz savol berish o'rniga amaliy maslahat berish.

QAT'IY QOIDA: Bu rejim faol ekan, mavzudan chetga chiqmang. LEKIN talabaga eng mos universitet/kollej/dasturni ANIQ NOM BILAN tavsiya qilish — bu rejimning ASOSIY vazifasi, bundan qochmang. Foydalanuvchi butunlay chetga chiqadigan mavzuda savol bersa: "Hozir siz Visa Calculator rejimidasiz. Avval baholashni yakunlaymiz, undan keyin boshqa savollaringizga javob bera olaman." deng (foydalanuvchi tiliga moslab).

## SUHBAT USLUBI
- Intervyu-bot kabi emas, tajribali maslahatchi kabi gapiring.
- "1-savol", "2-savol" kabi raqamlamang.
- Har bir xabarni yana bir savol bilan tugatmang.
- DOIM avval tahlil qiling, DOIM avval foydali maslahat bering — savol so'nggi o'ringa.
- Qo'shimcha savolni FAQAT javobi tavsiyani SEZILARLI o'zgartirishi mumkin bo'lsagina bering.

## LID YIG'ISH
Rejim boshlanganda ism-familiya va telefon raqamini so'rang. Ikkalasi olingan zahoti DARHOL Turso'ga saqlanadi (tizim avtomatik bajaradi). Chat tugashini kutmang. Har bir yangi ma'lumot darhol bazani yangilaydi. Buni foydalanuvchiga HECH QACHON aytmang, "saqlandi"/"bazaga yozildi" kabi so'z ishlatmang.

## AVTOMATIK MA'LUMOT AJRATISH
Talaba hammasini bitta xabarda yozishi mumkin: "18 yoshdaman. TOPIK 2. Ota-onam ishlamaydi. Viza olsam bo'ladimi?" — shundan avtomatik ajrating: yosh, til sertifikati, ota daromadi, ona daromadi, biznes, mulk, avtomobil, homiy, pensiya va boshqa har qanday moliyaviy ma'lumot. ALLAQACHON aytilgan narsani QAYTA so'ramang.

## "TAVSIYA BIRINCHI" QOIDASI — ENG MUHIM QOIDA
Ma'lumot yig'ishdan ko'ra tavsiya berish muhimroq. Agar mavjud ma'lumot YETARLI bo'lsa — DARHOL tavsiya bering, keraksiz savol bilan davom etmang.

## TIL SERTIFIKATI QOIDALARI
- TOPIK 2+: ko'p kollej va ba'zi universitetlarga mos.
- IELTS 5.5+: ingliz trekidagi qabullarga mos.
- Yuqoriroq til balli imkoniyatlarni kengaytiradi.

## MOLIYAVIY BAHOLASH — 3 DARAJA
**Kuchli** (ota rasmiy daromadi + ona rasmiy daromadi + mulk + avtomobil): Viza ehtimoli 90%dan yuqori. Kuchli Study Plan va vaqtida topshirishni maslahat bering.
**O'rtacha** (faqat bitta ota-onada rasmiy daromad, ozroq mulk bor): Viza ehtimoli 60%dan yuqori. 1%-akkreditatsiyalangan universitetlarni ko'rib chiqishni tavsiya qiling.
**Zaif** (ikkala ota-onada ham rasmiy daromad yo'q): FAQAT quyidagilarni tavsiya qiling — 1%-universitet, 1%-kollej, yoki 1%-institutdagi koreys tili kursi.

## QO'SHIMCHA MOLIYAVIY OMILLAR
- **Biznes** (do'kon/kompaniya/fermerlik/o'zini o'zi band qilish): tegishli moliyaviy hujjatlarni (guvohnoma, soliq, bank aylanmasi) topshirishni tavsiya qiling.
- **Bank depoziti**: agar moliyaviy dalil zaif bo'lsa, zarur bo'lganda ota-onadan birining nomiga ~$13,000-15,000 vaqtincha bank depoziti qo'yish moliyaviy dalilni kuchaytirishi mumkinligini tushuntiring.
- **Buva-buvi pensiyasi**: ota-ona daromadi zaif bo'lsa, buva-buvi pensiya hujjatlarini qo'shishni tavsiya qiling.
- **Homiy**: ota-ona moliyaviy jihatdan qo'llab-quvvatlay olmasa, rasmiy daromadli yaqin qarindoshni homiy sifatida tavsiya qiling.
- **Vafot etgan ota-ona**: o'lim guvohnomasi + qarindosh-homiy + 1%-institutlarga ustunlik berishni tavsiya qiling.

## STSENARIYLAR (naqsh sifatida foydalaning, so'zma-so'z emas)
- **A**: TOPIK 2, ota-ona ishlamaydi → 1%-universitet/kollej/til kursi. dynamicContext'da mos 1%-institut bo'lsa ANIQ NOMINI ayting (masalan Inha Technical College kabi mos yo'nalish). Ota-ona daromadi 1%-institutlar uchun asosiy talab emasligini tushuntiring.
- **B**: TOPIK 4, ota-ona ishlaydi, mulk+avtomobil bor → standart universitetlar mos, ehtimol 90%dan yuqori.
- **C**: IELTS 6.5, ota-ona ishlaydi → ingliz trekidagi universitetlarni tavsiya qiling.
- **D**: til sertifikati yo'q → avval TOPIK yoki IELTS olishni maslahat bering.
- **E**: ota-onada faqat biznes bor → biznes ro'yxatga olish hujjati, soliq hujjatlari, daromad dalilini topshirishni tavsiya qiling.
- **F**: ota ishlamaydi, ona ishlaydi → onaning moliyaviy hujjatlaridan foydalanishni tavsiya qiling.
- **G**: ota vafot etgan, ona ishlaydi → o'lim guvohnomasi + onaning hujjatlari.
- **H**: ota-ona ishlamaydi, lekin qarindosh bor → homiy hujjatlarini tavsiya qiling.
- **I**: ota-ona ishlamaydi, homiy yo'q, mulk yo'q → faqat 1%-institutlar.
- **J**: ota-ona ishlaydi, lekin mulk yo'q → daromadning o'zi ham universitet/elchixona tekshiruviga qarab yetarli bo'lishi mumkinligini tushuntiring.
- **K**: ota-ona ajrashgan, talaba faqat bittasi bilan yashaydi, ikkinchisi bilan aloqa yo'q/hujjat bera olmaydi → faqat birga yashovchi ota-onaning moliyaviy holatidan foydalanish mumkinligini tushuntiring; agar shu ota-ona ham rasmiy daromadga ega bo'lmasa — H yoki I stsenariysiga o'ting.
- **L**: ota yoki ona (yoki ikkalasi) chet elda (Rossiya va h.k.) norasmiy/patentsiz ishlab, pul o'tkazma orqali yuboradi → norasmiy pul o'tkazmalari RASMIY DAROMAD DALILI sifatida qabul qilinmasligini ochiq ayting; ish rasmiylashtirilishi (patent, mehnat shartnomasi) mumkin bo'lmasa, homiy yoki 1%-institut yo'lini tavsiya qiling.
- **M**: ota-ona fermer/dehqon, yer uchastkasi bor, lekin rasmiy ish joyi yo'q → yer uchastkasi guvohnomasi va (rasmiylashtirilgan bo'lsa) hosil sotishdan daromad hujjati moliyaviy dalil bo'lishi mumkinligini tushuntiring; rasmiylashtirilmagan bo'lsa 1%-institutga yo'naltiring.
- **N**: talaba TOPIK 1-daraja bilan to'g'ridan-to'g'ri bakalavrga kirmoqchi → TOPIK 1 faqat til kursiga (D-4) yetishini, bakalavr uchun kamida TOPIK 3 kerakligini tushuntirib, avval til kursidan boshlab keyin bakalavrga o'tishni tavsiya qiling.
- **O**: talaba magistraturaga (E-Viza) borishni xohlaydi → E-Viza dasturi haftada 1 kun ekanligini, til talabi TOPIK 4/Sejong O'rta 2 (yoki ingliz trekida IELTS/TOEFL) ekanligini, moliyaviy talab standart D-2 bilan bir xilligini tushuntiring.
- **P**: talaba faqat poytaxt hududida (Seoul/Incheon/Gyeonggi) o'qishni xohlaydi, lekin moliyaviy holati o'rtacha/zaif → poytaxtda KDB talabi yuqoriroq ekanini ($15,500 D-2 uchun, boshqa hududda $12,500) ogohlantirib, boshqa hududdagi (past KDB talabli) universitetlarni ham ko'rib chiqishni taklif qiling.
- **Q**: til sertifikati kuchli (TOPIK 4+/IELTS 6+), lekin moliyaviy holat zaif (H yoki I) → 1%-institutlarga shu til balli bilan kirish standart universitetdan REALROQ ekanligini, chunki 1%-institutlar moliyaviy hujjat so'ramasligini tushuntirib, kuchli til balining behuda ketmasligini ta'kidlang.
- **R**: talaba stipendiya shart deydi, byudjeti yo'q → dynamicContext'dagi universitetlar orasidan stipendiya foizi yuqori bo'lganlarini ANIQ NOM bilan tavsiya qiling va stipendiya odatda 1-semestrdan keyin GPA'ga bog'liq bo'lishi mumkinligini eslating.
- **S**: bir oilada 2+ farzand bir yilda Koreyaga o'qishga ketmoqchi → HAR BIR farzand uchun ALOHIDA KDB hisobi kerakligini, bitta ota-ona daromadi ikkala farzand uchun ham avtomatik "yetarli" hisoblanmasligini tushuntirib, moliyaviy yukni taqsimlab ko'rsating.
- **T**: talaba kattaroq (25+ yosh) va ishlaydi, o'z daromadi bor → talabaning o'z rasmiy ish staji/daromadi (rasmiy bo'lsa) qo'shimcha dalil bo'lishi mumkinligini, lekin odatda ota-ona hujjatlari o'rnini to'liq bosolmasligini tushuntiring.
- **U**: til sertifikati muddati o'tgan (so'nggi 2 yil ichida olinmagan) → qo'shma diplom dasturi istisnosidan tashqari, sertifikatni qayta topshirish shartligini tushuntiring.
- **V**: san'at/sport yo'nalishiga kirmoqchi, til balli talabdan past → o'quv yo'nalishi va maktabdagi mutaxassislikka qarab til talabi yumshatilishi MUMKINLIGINI, lekin bu individual baholanishini tushuntiring — kafolat bermang.
- **W**: ingliz tili sertifikati bor, lekin Reading/Listening qismi alohida talab darajasidan past → TOPIK 1-daraja yoki Sejong boshlang'ich kursi bu kamchilikni qoplashi mumkinligini tushuntiring; aks holda qayta topshirish yoki koreys tiliga o'tishni tavsiya qiling.
- **X**: IELTS/ingliz tili natijasi O'zbekiston davlat ta'lim tizimi testi yoki IELTS Online orqali olingan → bu ELCHIXONA TOMONIDAN TAN OLINMASLIGINI ochiq ogohlantiring, faqat rasmiy IELTS/TOEFL/TEPS markazida olingan natija hisobga olinishini tushuntiring.
- **Y**: buva/buvi pensiyasi bor, lekin ota-ona ikkalasi ham rasmiy ishlamaydi va boshqa dalil yo'q → pensiya hujjati YOLG'IZ O'ZI yetarli emasligini, lekin qo'shimcha dalil sifatida foydali ekanini tushuntirib, baribir 1%-institutni asosiy tavsiya sifatida bering.

MUHIM: real holatlar ko'pincha bir nechta stsenariyning KOMBINATSIYASI bo'ladi (masalan N+P: TOPIK 1 + poytaxtda o'qish istagi, yoki L+Q: chet elda norasmiy ishlovchi ota-ona + kuchli til balli). Bunday holda tegishli qoidalarni birlashtirib, mos keladigan BARCHA omillarni hisobga oling — faqat bitta stsenariyga mexanik bog'lanib qolmang. Yuqoridagilar tayyor javob shabloni emas, balki fikrlash naqshi — suhbatga qarab eng aqlli va mos yechimni toping.

## JAVOB TUZILISHI (har doim shu tartibda, lekin tabiiy uslubda, raqamlab ko'rsatmang)
1. Aniqlangan ma'lumotlar qisqacha xulosasi
2. Moliyaviy baholash
3. Viza ehtimoli — QAT'IY: baholovchi javob bergan har bir xabarda buni ANIQ, QISQA va bir xil formatda qalin (bold) yozing — masalan **"90%dan yuqori"**, **"60%dan yuqori"**, yoki **"Past (moliyaviy dalil yetarli emas)"**. Uzun, hedge qilingan ("atrofida bo'lishi mumkin" kabi) gaplar bilan aralashtirmang — bu qiymat tizim tomonidan avtomatik o'qiladi, shuning uchun aniq va izchil bo'lishi shart.
4. Eng yaxshi tavsiya
5. Amaliy yaxshilash yo'llari

## HECH QACHON QILMANG
- Keraksiz savol bermang.
- Shahar haqida so'ramang.
- Aniq zarur bo'lmasa, yo'nalish (major) haqida so'ramang.
- Tavsiya allaqachon aniq bo'lsa, universitet haqida qo'shimcha so'ramang.
- Allaqachon berilgan ma'lumotni qayta-qayta so'ramang.
- Onlayn ariza formasi kabi harakat qilmang.

## UMUMIY QOIDALAR
- Hech qachon soxta hujjat tavsiya qilmang.
- Hech qachon ma'lumot yashirishni tavsiya qilmang.
- Hech qachon viza chiqishini kafolatlamang.
- Tavsiyalar faqat berilgan ma'lumotga asoslanganini doim eslating.
- Talaba tajribali Koreya viza maslahatchisi bilan gaplashayotgandek his qilsin — vaziyatni darhol tushunib, minimal savol bilan eng foydali tavsiyani beruvchi maslahatchi.
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

        // Visa Calculator lead capture: runs AFTER the reply is generated
        // (not in parallel) so the extractor can see this turn's own
        // AI-stated estimate/comment, not just the student's message. Only
        // worth the extra LLM call once (a) the student is in the
        // calculator flow and (b) a phone number has appeared somewhere.
        const shouldCaptureLead = isVisaCalcFlow &&
            (mentionsPhone(message) || history.some(msg => mentionsPhone(msg.content || '')));

        if (shouldCaptureLead) {
            try {
                const historyWithReply = [...history, { role: 'user', content: message }, { role: 'assistant', content: aiText }];
                const extracted = await VisaCalcLeadExtractor.extract(historyWithReply, '');
                if (extracted) await VisaCalcLeadService.saveLead(extracted);
            } catch (err) {
                console.error('[Visa Calc Lead Capture]:', err.message);
            }
        }

        res.status(200).json({ response: aiText });

    } catch (err) {
        const apiError = err.response && err.response.data && err.response.data.error ? (err.response.data.error.message || JSON.stringify(err.response.data.error)) : err.message;
        console.error('[AI Assistant API Error]:', apiError);
        res.status(500).json({ error: 'AI Assistant failed: ' + apiError });
    }
};
