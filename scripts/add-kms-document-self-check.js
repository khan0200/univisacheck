const db = require('../lib/db');

// New KMS content from a "Bright Future Consulting" reference doc: a
// practical self-check list students should run on their own documents
// before submission, and a 10-point Admission (CoA) consistency checklist.
// This is distinct from KMS id=8 (which explains WHAT each document is,
// generically) -- this is granular cross-document consistency rules
// (name/DOB must match passport 100%, admission major must match study
// plan, etc.) that weren't captured anywhere before.
//
// Deliberately EXCLUDED: the source doc's self-promotion for a specific
// consulting agency (visamaster.uz calculator ad, "we check documents
// free" pitch) -- that's third-party marketing, not neutral procedural
// information, and doesn't belong in this assistant's knowledge base.

const entries = [
    {
        question: "Viza uchun hujjatlarimni topshirishdan oldin o'zim qanday tekshirishim kerak?",
        answer: `== TALABANING O'ZI MUSTAQIL TEKSHIRISHI KERAK BO'LGAN HUJJATLAR RO'YXATI ==
========================================================
Koreya ta'lim vizasiga topshirishda hujjatlar orasidagi eng kichik xato ham (masalan ism-familiyaning bir harfi mos kelmasligi) rad etilishga sabab bo'lishi mumkin. Talabaga har bir hujjatni quyidagi bandlar bo'yicha o'zi tekshirishni tavsiya qiling.

## 1. Pasport va ID karta
- Pasportning yaroqlilik muddati kamida 1 yil bo'lishi kerak.
- Ism-familiya BARCHA hujjatlarda bir xil bo'lishi shart.
- Biometrik pasport bo'lsa — my.gov.uz'dan JSHIR ko'rsatilgan ma'lumotnoma olish shart.

## 2. Diplom yoki attestat
- Diplom/attestatda maktab pechati bo'lishi kerak.
- Apostil oxirgi 6 OY ichida olingan bo'lishi kerak.
- Tarjimasida ism, familiya, tug'ilgan sana pasportga to'liq mos bo'lishi kerak.

## 3. Ota-ona daromad hujjatlari (holatga qarab biri tanlanadi)
- **Rasmiy ishda bo'lsa:** yillik daromad ma'lumotnomasi (my.gov.uz) + mehnat daftarcha.
- **Biznesi bo'lsa:** biznes guvohnomasi + yillik oborot + soliq to'laganlik ma'lumotnomasi.
- **Ishsiz bo'lsa:** uy-joy yoki mashina ma'lumotnomasi (mulk kamida 3 oy o'sha kishi nomida saqlangan bo'lishi shart).
- **Qo'shimcha (ixtiyoriy) dalil sifatida:** ota-ona nomiga alohida 1 kunlik bank ko'chirmasi (bankshot) — kamida $10,000. DIQQAT: bu talabaning O'Z KDB hisobidan (9-band) FARQLI, qo'shimcha/ixtiyoriy hujjat — asosiy rasmiy daromad/mulk hujjatisiz faqat shu bankshot yetarli emas.

## 4. Ota-ona pasporti va nikoh guvohnomasi
- Pasportlar yaroqlilik muddatidan o'tmagan bo'lishi kerak.
- Tarjimada ism-familiya pasport bilan bir xil bo'lishi kerak.

## 5. Tug'ilganlik guvohnomasi (metrika)
- Notarial tarjima qilingan bo'lishi kerak.
- Talaba va ota-onaning ism-familiyalari pasportga mos bo'lishi kerak.

## 6. 18 yoshdan oshganlar uchun turmush holati
- my.gov.uz'dan "turmush qurmaganligi" haqida spravka OLIB, yoki nikoh qog'ozi (tarjima bilan) taqdim etiladi.

## 7. Rasm (3.5 x 4.5)
- Oq fonda, elektron VA bosma variantlarining ikkalasi ham tayyor bo'lishi kerak.

## 8. Til sertifikati (TOPIK, SKA yoki IELTS)
- Sertifikat yaroqlilik muddati tugamagan bo'lishi kerak.
- IELTS bo'lsa: Listening va Reading bo'limlarining HAR BIRI alohida kamida 5.5 bo'lishi shart (qarang: to'liq til talablari yozuvi).

## 9. KDB bankshot (TALABANING O'Z HISOBI — ENG MUHIM HUJJAT)
- Balans: Poytaxt (Seul va atrofi) uchun $15,500; boshqa viloyatlar uchun $12,500.
- Bu summa 1 OY davomida UZLUKSIZ (to'xtatilmasdan) saqlangan bo'lishi kerak.
- Talabaning ism-familiyasi va tug'ilgan sanasi ma'lumotnomada pasportga mos yozilgan bo'lishi kerak.
- Agar ota-ona nomiga bankshot qilinsa, ularning ism-familiyasi ham pasportlariga mos bo'lishi shart.
========================================================`,
        category: "visa_calc",
        topic: "Document Self-Check List",
        keywords: [
            "hujjat", "tekshirish", "pasport", "diplom", "attestat", "daromad", "nikoh", "metrika",
            "rasm", "sertifikat", "kdb", "bankshot", "oz tekshirish", "apostil"
        ],
        aliases: [
            "hujjatlarimni qanday tekshiraman", "viza uchun hujjat tekshirish",
            "hujjatlar ro'yxati va talablari", "KDB bankshot talablari"
        ],
        language: "uz"
    },
    {
        question: "Admission (universitet qabul xati) hujjatini qanday tekshirish kerak, xato bo'lsa nima bo'ladi?",
        answer: `== ADMISSION (UNIVERSITY TAKLIFNOMASI) NI TEKSHIRISH — 10 BAND ==
========================================================
Admission — universitet tomonidan beriladigan rasmiy qabul xati bo'lib, Koreya elchixonasi aynan shu hujjatdagi ma'lumotlarga eng katta e'tibor beradi. Talabaga har bir admissionni quyidagi 10 band bo'yicha diqqat bilan tekshirishni tavsiya qiling.

**10.1. Ism va familiya** — pasport bilan 100% bir xil bo'lishi kerak. Ko'p uchraydigan xatolar: harflar noto'g'ri tartibda, O', G' kabi harflar tarjimasi noto'g'ri, ortiqcha/tushib qolgan harf. DIQQAT: ism bitta harf bilan ham boshqacha bo'lsa — viza rad bo'lishi mumkin.

**10.2. Tug'ilgan sana** — pasportdagiga 100% mos bo'lishi kerak (yil, oy, kun ketma-ketligi to'g'ri). Ko'p uchraydigan xato: yil raqamlari almashtirilib yozilishi (masalan 2005-07-03 o'rniga 2003-07-03).

**10.3. Pasport seriya raqami** — bironta raqam yoki harf xato bo'lmasligi kerak. Bu eng ko'p xato qilinadigan bandlardan biri.

**10.4. Jinsi (Gender)** — Male/Female noto'g'ri belgilansa, elchixona vizasida muammo bo'ladi.

**10.5. Degree (o'qish darajasi)** — Language Program / Bachelor's / Master's / Doctorate / Vocational Training to'g'ri ko'rsatilgan bo'lishi kerak. Agar talaba vokatsion (kasbiy ta'lim) dasturga topshirgan bo'lsa-yu, hujjatda "Bachelor" deb ko'rsatilsa — bu muammo tug'diradi.

**10.6. Major (yo'nalish)** — universitet admission hujjatida yozilgan yo'nalish talabaning Study Planida yozgan yo'nalish bilan AYNAN BIR XIL bo'lishi shart. Eng keng tarqalgan xato: admissionda masalan "Marine Power Engineering" deb yozilgan bo'lsa-yu, Study Planda "Tourism Management" deb yozilsa — elchixona "nima uchun ikki xil yo'nalish bor, talabaning maqsadi aniq emas" deb shubha qiladi va bu rad etilish sababi bo'lishi mumkin. Talaba mustaqil tekshirishi kerak bo'lgan savol: "Admissiondagi major bilan Study Planimdagi major bir xilmi?" Farq bo'lsa, darhol agentlik/universitetga xabar berish shart.

**10.7. O'qish tili (Language of Instruction)** — Koreys tilida topshirilgan bo'lsa 'A', ingliz tilida topshirilgan bo'lsa 'C' belgilanishi kerak. Til noto'g'ri ko'rsatilsa, til sertifikati mos tushmaydi va viza rad etilishi mumkin.

**10.8. O'qish muddati (Start-End Date)** — boshlanish sanasi va dastur muddati to'g'ri yozilgan bo'lishi kerak. Muddati noto'g'ri bo'lsa, elchixona qabulning haqiqiyligiga shubha bilan qaraydi.

**10.9. Universitet muhri va imzosi** — rasmiy muhr va mas'ul shaxsning imzosi bo'lishi, muhr yaxshi chiqmagan yoki chizilgan bo'lmasligi kerak.

**10.10. Talabaning o'zi imzo qo'ygani** — admissionda talaba uchun ajratilgan imzo joyi bo'ladi; talaba imzo qo'ymasa, viza jarayoni to'xtab qolishi mumkin (bu ko'p uchraydigan e'tiborsizlik xatosi).
========================================================`,
        category: "visa_calc",
        topic: "Admission Document Check",
        keywords: [
            "admission", "qabul xati", "taklifnoma", "major", "yonalish", "ism", "tugilgan sana",
            "imzo", "muhr", "degree", "til", "instruction"
        ],
        aliases: [
            "admission qanday tekshiriladi", "admissionda ism xato", "major study plan bilan mos emas",
            "admission imzo", "admission muhr tekshirish"
        ],
        language: "uz"
    }
];

async function run() {
    console.log("Adding document self-check entries to KMS...");
    for (const e of entries) {
        const existing = await db.execute({
            sql: `SELECT id FROM ai_knowledge WHERE LOWER(question) = ?`,
            args: [e.question.toLowerCase()]
        });
        if (existing.rows.length > 0) {
            console.log(`Already exists (id=${existing.rows[0].id}), skipping: ${e.question}`);
            continue;
        }
        const insert = await db.execute({
            sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
            args: [
                e.question, e.answer, e.category, e.topic,
                JSON.stringify(e.keywords), JSON.stringify(e.aliases), e.language,
                "admin_document_selfcheck"
            ]
        });
        console.log(`Inserted id=${insert.rows[0].id}: ${e.question}`);
    }
}

run().catch(e => { console.error(e); process.exit(1); });
