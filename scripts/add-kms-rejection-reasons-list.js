const db = require('../lib/db');

// Official trilingual (Korean/Russian/Uzbek) visa rejection reason checklist
// (거부사유 / ПРИЧИНА ОТКАЗА / Viza inkor etilishi sababi) used by Korean
// consular/immigration rejection notices, items 1-11. This is the exact
// numbered list users mean when they say "N-band bilan otkaz oldim" — the
// AI previously answered from general reasoning about "8-band" without this
// literal source text, so responses were an approximation, not a quote.

const entry = {
    question: "Koreya vizasi rad etilish (otkaz) sabablari - rasmiy 1-11 band ro'yxati to'liq qanday?",
    answer: `== VIZA RAD ETILISHI (OTKAZ) SABABLARI - RASMIY RAQAMLANGAN BANDLAR RO'YXATI ==
========================================================
Bu — Koreya konsullik/immigratsiya xizmati rad etish xatida ishlatiladigan RASMIY, RAQAMLANGAN sabablar ro'yxati (거부사유 / ПРИЧИНА ОТКАЗА / Viza inkor etilishi sababi). Foydalanuvchi "N-band bilan otkaz oldim" desa, AYNAN shu bandning matnini keltiring — o'zingizdan taxmin qilib boshqa narsa yozmang.

**1-band:** Siz yaroqli pasportga ega emassiz yoki zaruriy hujjatlarni topshirmagansiz.
(Sizda amaldagi pasport/sayohat hujjati yo'q yoki kerakli hujjatlarni taqdim etmagansiz.)

**2-band:** Migratsiya qonunining 11-bo'lim (davlatga kirishga oid taqiq) 1-bandiga sizning taalluqliligingiz bor.
(Chiqish-kirish nazorati to'g'risidagi qonunning 11-moddasi, 1-band — kirishga taqiq asosida.)

**3-band:** Koreya Respublikasiga avvalgi tashrifingizda Koreya Respublikasining qonunchiligini buzgansiz.
(Ilgari Koreyada bo'lgan vaqtingizda mahalliy qonunlarni buzgan holatingiz bor.)

**4-band:** Tashrif maqsadingizni yoritib berishda yetarli hujjat(lar)ni topshirmagansiz.
(Safar/o'qish maqsadingizni asoslovchi qo'shimcha hujjatlar yetarli emas.)

**5-band:** Tashrif maqsadingiz Koreya Respublikasining migratsiya qonuni 10-bo'limida keltirilgan Koreya Respublikasida istiqomat qilishga oid talablarga mos kelmaydi.
(Safar maqsadingiz qonunda belgilangan istiqomat maqomi (viza turi) shartlariga to'g'ri kelmaydi.)

**6-band:** Siz topshirgan hujjatlaringizning haqiqiyligi tasdiqlanmadi.
(Taqdim etilgan hujjatlarning asl/qalbaki emasligini tasdiqlab bo'lmadi — SOXTA HUJJAT GUMONI.)

**7-band:** Siz tashrif maqsadingizni to'liq yoritib bera olmadingiz.
(Nega Koreyaga borayotganingiz, o'qish rejangiz (Study Plan) yetarlicha ishonarli/mantiqiy asoslanmagan.)

**8-band:** Siz belgilangan istiqomat muddatida o'z davlatingizga qaytib kela olishingizni tasdiqlab bera olmagansiz (daromad/sarmoyaning yetarli emasligi sababli).
(Oilaviy va moliyaviy holatingiz — daromad, mulk, bank hisobi — O'zbekistonga muddatida qaytishingizni ishonarli tasdiqlash uchun YETARLI EMAS deb topilgan. Bu ENG KO'P uchraydigan moliyaviy asosdagi rad sababi.)

**9-band:** Sizni taklif qiluvchining taklif qilish vakolati to'liq emas.
(Universitet yoki taklif qiluvchi tashkilotning rasmiy vakolati/hujjatlari to'liq emas — odatda talaba emas, universitet/agentlik tomonidagi kamchilik.)

**10-band:** Siz taklif qiluvchi bilan aloqadorligingizni asoslab bera olmagansiz.
(Sizni taklif qilgan tomon — universitet, qarindosh va h.k. — bilan bog'liqligingizni isbotlovchi hujjat yetarli emas.)

**11-band:** Boshqalar (기타 / Другое).
(Yuqoridagi 10 bandga kirmaydigan, alohida ko'rsatilishi mumkin bo'lgan boshqa sabab.)

## MUHIM IZOHLAR AI UCHUN
- Foydalanuvchi qaysi bandda otkaz olganini aytsa, FAQAT o'sha bandning rasmiy matnini aniq va to'liq keltiring, keyin oddiy tilda tushuntiring.
- **7-band va 8-band ENG KO'P uchraydi**: 7-band — Study Plan/maqsad yetarlicha ishonarli emasligi; 8-band — moliyaviy hujjatlar (daromad/mulk/bank) yetarli emasligi. Bularning har biri uchun tushuntirish xati (explanation letter) shabloni mavjud (qarang: "Moliyaviy hujjatlar va murakkab viza holatlari" yozuvi).
- **6-band (soxta hujjat gumoni) ENG XAVFLI**: bu holatda qayta topshirish juda qiyinlashadi va kelajakda "qora ro'yxat"ga tushish xavfi bor — foydalanuvchini bu haqda ogohlantiring va rasmiy maslahatchi bilan bog'lanishni tavsiya qiling.
- Hech qachon aniq sababni o'zingizdan to'liq ishonch bilan taxmin qilmang — agar foydalanuvchi rad xatidagi band raqamini aniq aytmasa, "Rad xatingizda qaysi band(lar) belgilangan (✓/☑) ekanini ayting, shunda aniqroq tushuntira olaman" deb so'rang.
- Qayta topshirishda vizaning albatta chiqishini hech qachon KAFOLATLAMANG. Yakuniy qaror faqat Elchixona/Immigratsiyaga tegishli.
========================================================`,
    category: "visa_calc",
    topic: "Rejection Reasons Official List",
    keywords: [
        "band", "otkaz", "rad", "inkor", "sabab", "viza rad", "1-band", "2-band", "3-band", "4-band",
        "5-band", "6-band", "7-band", "8-band", "9-band", "10-band", "11-band",
        "soxta", "hujjat", "pasport", "taklifnoma", "vakolat", "istiqomat", "sarmoya", "daromad", "moliyaviy"
    ],
    aliases: [
        "8-band bilan otkaz", "7-band bilan otkaz", "viza rad etilish sabablari",
        "otkaz sababi nima", "band bilan rad etildi", "rasmiy rad sabablari ro'yxati",
        "거부사유", "viza inkor etilishi sababi"
    ],
    language: "uz"
};

async function run() {
    console.log("Adding official visa rejection reasons list to KMS...");
    const existing = await db.execute({
        sql: `SELECT id FROM ai_knowledge WHERE LOWER(question) = ?`,
        args: [entry.question.toLowerCase()]
    });
    if (existing.rows.length > 0) {
        console.log(`Already exists (id=${existing.rows[0].id}), skipping.`);
        return;
    }
    const insert = await db.execute({
        sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
        args: [
            entry.question, entry.answer, entry.category, entry.topic,
            JSON.stringify(entry.keywords), JSON.stringify(entry.aliases), entry.language,
            "admin_official_rejection_list"
        ]
    });
    console.log(`Inserted id=${insert.rows[0].id}`);
}

run().catch(e => { console.error(e); process.exit(1); });
