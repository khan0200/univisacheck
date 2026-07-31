const db = require('../lib/db');

// Source: Official Embassy of the Republic of Korea in Uzbekistan notice
// "유학사증 신청자 제출 서류 및 심사 방안" dated 2026.01.06 (Consular section).
// Adds the language-requirement tables and special-case financial rules that
// were missing from the existing KMS/system prompt (KDB amounts, 1% university
// exemption, and no-interview rule were already present).

const entries = [
    {
        question: "D-2/D-4 viza uchun til talablari (TOPIK, SKA, Sejong, IELTS, TOEFL, TEPS) qanday?",
        answer: `== TIL TALABLARI (2026.01.06 ELCHIXONA QOIDALARI) ==
========================================================
Faqat SO'NGGI 2 YIL ICHIDA olingan til sertifikatlari tan olinadi.

## KOREYS TILI (TOPIK / Sejong Baholash - SKA / Sejong instituti kursi)
| Bosqich | TOPIK | SKA | Sejong instituti kursi |
|---|---|---|---|
| Til kursi (D-4-1) | 1-daraja (PBT 110+ / IBT 170+) | 150 ball | Boshlang'ich kursini tugatgan |
| Kollej / Professional bakalavr (전문학사) | 2-daraja | 201 ball | Boshlang'ich 2 yoki undan yuqori |
| Bakalavr | 3-daraja | 321 ball | O'rta 1 yoki undan yuqori |
| Magistr va undan yuqori | 4-daraja | 441 ball | O'rta 2 yoki undan yuqori |
| Almashinuv talabasi (diplom berilmaydigan, D-2) | 2-daraja | 201 ball | Kursni tugatgan |

- Quyi darajali (konsalting) universitetlar uchun MAXSUS QOIDA: Bakalavr va undan yuqori — TOPIK 4-daraja yoki Sejong O'rta 2 kursi (SKA UMUMAN TAN OLINMAYDI!); Kollej (professional bakalavr) — TOPIK 3-daraja yoki Sejong O'rta 1.
- San'at/sport yo'nalishiga o'qishga kirganlarda o'quv yo'nalishi va o'rta maktabdagi mutaxassislikni ko'rib chiqib, til talabini yumshatish (kamaytirish) mumkin — bu holat individual tarzda baholanadi.

## INGLIZ TILI (Ingliz trekida - English Track - o'qiganlar uchun)
- Minimal ballar: IELTS 5.5, CEFR B2, TOEFL 530 (CBT 197 / iBT 71), TEPS 601 (Yangi TEPS 327).
- IELTS: umumiy ball 5.5dan tashqari, Reading va Listening bo'limlarining HAR BIRI alohida kamida 5.5 bo'lishi SHART.
- TOEFL iBT: umumiy 71 balldan tashqari, Reading va Listening bo'limlarining HAR BIRI alohida kamida 18 ball bo'lishi SHART.
- Reading/Listening ballari biroz yetishmasa ham, agar talaba TOPIK 1-daraja yoki Sejong instituti boshlang'ich kursini tugatgan bo'lsa — baribir tan olinadi (Koreys tili bilimi kamchilikni qoplaydi).
- MUHIM CHEKLOV: O'zbekiston Respublikasi Xalq ta'limi/Oliy ta'lim vazirligi tomonidan o'tkaziladigan ingliz tili testlari va IELTS Online (onlayn) natijalari ELCHIXONA TOMONIDAN TAN OLINMAYDI. Faqat rasmiy IELTS/TOEFL/TEPS markazlarida olingan natija hisobga olinadi.

## QO'SHMA DIPLOM DASTURI (Joint Degree Program) uchun til talabi
- Umumiy qoida: til sertifikati SO'NGGI 2 YIL ICHIDA olingan bo'lishi kerak.
- Istisno: qo'shma diplom dasturiga qabul qilinganlar uchun, universitetga kirish (qabul) paytida olingan til sertifikati ham tan olinishi mumkin (garchi 2 yildan eski bo'lsa ham).
- LEKIN: agar o'sha qabul paytidagi til natijasi ham talab darajasidan (yuqoridagi jadvaldan) past bo'lsa — bunday holatda sertifikat TAN OLINMAYDI va yangi sertifikat talab qilinadi.
========================================================`,
        category: "visa_calc",
        topic: "Language Requirements",
        keywords: ["topik", "ska", "sejong", "ielts", "toefl", "teps", "til", "sertifikat", "daraja", "bal", "ingliz", "koreys", "talab", "qoshma", "diplom"],
        aliases: ["til talablari", "TOPIK daraja talabi", "SKA ball talabi", "sejong instituti kursi", "IELTS talab", "TOEFL talab", "ingliz tili sertifikati", "qo'shma diplom til talabi", "til sertifikati necha ball"],
        language: "uz"
    },
    {
        question: "Almashinuv talabasi, qisqa muddatli o'qish uchun moliyaviy talab qancha va hujjatlar qanday ko'rib chiqiladi?",
        answer: `== MAXSUS HOLATLAR: ALMASHINUV, QISQA MUDDATLI O'QISH VA HUJJATLARNI KO'RIB CHIQISH TARTIBI (2026.01.06) ==
========================================================

## ALMASHINUV TALABASI (Exchange student, diplom berilmaydigan dastur)
- Talabaning o'z nomidagi KDB bank hisobida kamida 1 OY saqlangan mablag' talab qilinadi.
- Miqdor Til kursi (D-4-1) bilan BIR XIL: Poytaxt mintaqasida (Seul / Gyeonggi / Incheon) $7,800 yoki 97,500,000 so'm va undan yuqori; boshqa hududlarda $6,300 yoki 78,700,000 so'm va undan yuqori.

## QISQA MUDDATLI O'QISH (turish muddati 6 oydan kam bo'lgan holatlar)
- KDB bank hisobida kamida 1 OY saqlangan mablag' talab qilinadi.
- Miqdor formulasi: (O'quv haqi + yashash xarajati), kishi boshiga eng kam $780 (9,700,000 so'm) × turish oylari soni.

## HUJJATLARNI KO'RIB CHIQISH TARTIBI (SCREENING METHOD)
- Til bilimini tasdiqlovchi hujjat topshira olmagan talabalar SUHBATSIZ rad etiladi (Koreya talaba (D-2/D-4) vizalarida umuman elchixona suhbati yo'q).
- "O'quv rejasi / maqsad bayoni" (Study Plan / 유학기술서) albatta ARIZACHINING O'ZI tomonidan shaxsan yozilishi SHART. Agar boshqa kishi (masalan, konsalting agentligi xodimi) talaba o'rniga yozgani aniqlansa — bu ARIZANI RAD ETISH sababi bo'lishi mumkin.
- KDB bank ma'lumotnomasi FAQAT ariza topshirilgan sanadan 30 KUN ICHIDA berilgan bo'lsa tan olinadi. Elchixona qoldiq mablag' mavjudligini vaqt oralig'ida (masalan bir necha hafta o'tib) QAYTA TEKSHIRISHI mumkin — shuning uchun pulni faqat ma'lumotnoma olish uchun vaqtincha hisobga qo'yib, keyin darhol yechib olish xavfli va aniqlanishi mumkin.
- A'lo tan olingan universitetlar (우수인증대, shu jumladan til kursi ham) uchun — moliyaviy hujjatlar (KDB, ota-ona daromadi va mulk hujjatlari) TALAB QILINMAYDI, lekin til bilimi hujjatlari baribir SHART va tekshiriladi.
- Ota-onaning kasbi "yuklab yuboriladigan hujjatlar" shaklidagi tegishli maydonda ALBATTA to'liq va aniq ko'rsatilishi shart — bo'sh qoldirilishi yoki noaniq yozilishi kamchilik sifatida baholanadi.
========================================================`,
        category: "visa_calc",
        topic: "Special Financial Cases & Screening",
        keywords: ["almashinuv", "exchange", "qisqa", "muddat", "kdb", "moliyaviy", "tekshirish", "screening", "study", "plan", "reja", "suhbat", "qayta"],
        aliases: ["almashinuv talabasi moliyaviy talab", "qisqa muddatli o'qish moliyaviy talab", "study plan o'zi yozishi shart", "KDB qayta tekshirish", "KDB 30 kun ichida", "hujjatlarni ko'rib chiqish tartibi"],
        language: "uz"
    }
];

async function run() {
    console.log("Adding 2026.01.06 official Embassy language & financial rule entries to KMS...");
    for (const e of entries) {
        const existing = await db.execute({
            sql: `SELECT id FROM ai_knowledge WHERE LOWER(question) = ?`,
            args: [e.question.toLowerCase()]
        });
        if (existing.rows.length > 0) {
            console.log(`Skipping (already exists, id=${existing.rows[0].id}): ${e.question}`);
            continue;
        }
        const insert = await db.execute({
            sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
            args: [
                e.question,
                e.answer,
                e.category,
                e.topic,
                JSON.stringify(e.keywords),
                JSON.stringify(e.aliases),
                e.language,
                "admin_2026_embassy_notice"
            ]
        });
        console.log(`Inserted id=${insert.rows[0].id}: ${e.question}`);
    }
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
