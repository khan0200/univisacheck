const db = require('../lib/db');

// New KMS entry: the 25-question Study Plan drafting worksheet from a
// "Bright Future Consulting" reference doc. Distinct from KMS id=4 (which
// covers the RULES for what makes a Study Plan pass/fail) -- this is an
// interactive TOOL: when a student doesn't know what to write, the AI walks
// them through these questions to build the actual content themselves,
// which also naturally avoids the plagiarism risk covered in id=4.

const entry = {
    question: "Study Plan yozishga tayyor emasman, nima yozishni bilmayman - yordam bera olasizmi?",
    answer: `== STUDY PLAN YOZISHGA YORDAM BERUVCHI SAVOLNOMA (25 TA SAVOL) ==
========================================================
Agar talaba Study Plan/Personal Statement yozishda nima yozishni bilmasligini aytsa, unga tayyor namunani KO'CHIRIB berish O'RNIGA (bu plagiat xavfi tug'diradi — qarang: Study Plan qoidalari), quyidagi savollarni birma-bir bering va talabaning o'z javoblaridan uning shaxsiy Study Plan matnini shakllantirishga yordam bering. Bu usul talabaning HAQIQIY va SAMIMIY matn yozishini ta'minlaydi.

## SHAXSIY MA'LUMOTLAR
1. To'liq ism-sharifingiz?
2. Qaysi viloyat va tumanda tug'ilgansiz? Hozir qayerda yashaysiz?
3. Oilangiz tarkibi? Ota-onangizning kasbi?

## O'QUV TARIXI
4. Maktabni qaysi yilda tugatdingiz? O'qish davomida eng yaxshi ko'rgan fanlaringiz qaysilar?
5. Maktabda qanday yutuqlar yoki tanlovlarda ishtirok etgansiz?
6. Qo'shimcha kurslarda o'qiganmisiz? Qaysi fanlardan?
7. IELTS, TOPIK yoki boshqa til sertifikatingiz bormi? Natijalaringiz qanday?

## KOREYA VA UNIVERSITET TANLOVI
8. Koreya haqida birinchi bor qayerdan eshitgansiz? Qanday taassurot olgansiz?
9. Nima uchun aynan Koreyada o'qimoqchisiz?
10. Qaysi universitetga va qaysi yo'nalishga topshirayapsiz?
11. Nega aynan shu yo'nalishni tanladingiz?

## KOREYADAGI REJALAR
12. O'qishga kirganingizdan keyin 2 yoki 4 yil davomida nimalar qilishni rejalashtiryapsiz?
13. Qaysi to'garaklar, klub yoki universitet ichidagi faoliyatlarda qatnashmoqchisiz?
14. Koreyada o'qish vaqtida til darajangizni qanday yaxshilamoqchisiz?
15. Kompyuter yoki o'zingiz tanlagan sohaga oid qanday dastlabki bilimlaringiz bor?
16. Kelajakda o'qish davomida qanday amaliyot yoki loyihalarda qatnashmoqchisiz?
17. O'qish vaqtida qanday shaxsiy ko'nikmalarni rivojlantirmoqchisiz?

## KELAJAK REJALARI (MUHIM — O'ZBEKISTONGA QAYTISH TA'KIDLANISHI SHART)
18. O'qishni bitirgandan keyingi rejalar? (Javob albatta O'zbekistonga qaytish/mutaxassis bo'lishni ko'rsatishi kerak — "Koreyada qolaman" degan javob YOZILMASLIGI kerak)
19. Koreyada uzoq muddat qolish rejangiz bormi? (To'g'ri javob: "Yo'q, asosiy maqsad bilim olib, O'zbekistonga qaytib ishlash")
20. O'zingizni 5 yil va 10 yildan keyin qanday tasavvur qilasiz?
21. Koreyada o'qishga tayyor ekanligingizni isbotlaydigan shaxsiy fazilatlaringiz?

## QO'SHIMCHA / ISHONCH OMILLARI
22. Mustaqil holda yashash, vaqt boshqarish va intizom borasida o'zingizni qanday baholaysiz?
23. Ota-onangiz sizning Koreyada o'qishingizni qo'llab-quvvatlaydimi?
24. Koreyada o'qish sizning hayotingizda qanday o'zgarishlar olib kelishini o'ylaysiz?
25. Nega elchixona sizga viza berishi kerak, deb o'ylaysiz?

## AI UCHUN KO'RSATMA
- Bu savollarga berilgan javoblarni tayyor Study Plan matniga (6 qismli tuzilma: Introduction, Why Korea, Why University, Why Major, Study Plan in Korea, Future Goals) o'zingiz join qilib yozib bering — lekin doim TALABANING O'Z JAVOBLARIGA asoslaning, o'zingizdan mazmun to'qib chiqarmang.
- Talabaga har doim eslating: bu — SIZNING shaxsiy tarixingiz asosida yozilgan matn, uni boshqa birov bilan bo'lishmang yoki internetdagi namunalardan nusxa olmang — bu plagiat sifatida aniqlanib, viza rad etilishiga olib kelishi mumkin.
- 18 va 19-savollarga javob "Koreyada qolaman/ishlayman" mazmunida bo'lsa, talabani ogohlantiring — bu javob Study Planga TO'G'RIDAN-TO'G'RI yozilmasligi kerak, chunki bu viza rad etilishining asosiy sabablaridan biri.
========================================================`,
    category: "general_advice",
    topic: "Study Plan Questionnaire",
    keywords: [
        "study plan", "personal statement", "savolnoma", "yordam", "yozishga", "nima yozish",
        "insho", "motivatsion", "25 savol", "tayyor emasman"
    ],
    aliases: [
        "study plan yozishga yordam", "nima yozishni bilmayman", "study plan savollari",
        "personal statement qanday yozish kerak", "study plan uchun savolnoma"
    ],
    language: "uz"
};

async function run() {
    console.log("Adding Study Plan questionnaire to KMS...");
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
            "admin_study_plan_worksheet"
        ]
    });
    console.log(`Inserted id=${insert.rows[0].id}`);
}

run().catch(e => { console.error(e); process.exit(1); });
