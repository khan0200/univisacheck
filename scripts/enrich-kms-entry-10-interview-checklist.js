const db = require('../lib/db');

// Enriches KMS id=10 (university ADMISSION interview prep, explicitly NOT
// the embassy visa process) with genuinely new, actionable detail from a
// "Bright Future Consulting" doc: pre-interview technical/document
// checklist, clothing guidance, stress-reduction tips, and the "it's fine
// to pause and think" note. Deliberately NOT adding full scripted answers
// in 3 languages -- the existing entry already stresses "understand, don't
// memorize," and pre-written answers would undercut that.

async function run() {
    console.log("Enriching KMS entry id=10 with interview prep checklist...");
    const current = await db.execute({ sql: `SELECT answer, keywords, aliases FROM ai_knowledge WHERE id = 10` });
    const row = current.rows[0];

    const anchor = `- **Eng ko'p beriladigan savollar:**`;
    if (!row.answer.includes(anchor)) throw new Error('anchor not found');
    if (row.answer.includes('SUHBATDAN OLDINGI TAYYORGARLIK RO\'YXATI')) {
        console.log('Already present, skipping.');
        return;
    }

    const insertion = `## SUHBATDAN OLDINGI TAYYORGARLIK RO'YXATI
- **Internet va texnika:** kuchli Wi-Fi, kompyuter orqali kirish (telefon emas), kamera va mikrofonni oldindan tekshirish, zaxira internet (mobil hotspot) tayyor turishi.
- **Muhit:** jim va toza xona, orqa fonda yotoq/idish-tovoq/odamlar ko'rinmasligi, yorug'lik yuzga tushishi, kamera to'g'ri qaratilgan bo'lishi.
- **Hujjatlar yoningizda tursin:** pasport, Admission, Study Plan (qo'lda yozilgan nusxasi), CV/Resume (agar kerak bo'lsa) — savolni adashtirib qo'yganda ularga qarab izchil gapirish mumkin.
- **Kiyim:** oddiy va tartibli (oq ko'ylak yoki toza futbolka, qora/ko'k ranglar yaxshi ko'rinadi). Uy kiyimi, sportki, kapyushon KIYMANG — uyda o'tirsangiz ham, bu rasmiy uchrashuv.
- **Stressni kamaytirish:** suhbatdan oldin 5 daqiqa chuqur nafas oling. Suhbat sizni qo'rqitish uchun emas, maqsadingizni bilish uchun — Koreys professorlari odatda juda muloyim bo'ladi.

## QO'SHIMCHA MASLAHATLAR
- Agar javobni o'ylab olish kerak bo'lsa, "Let me think for a moment" ("잠시만 생각해 보겠습니다") deyish mutlaqo normal — shoshilib, tushunarsiz javob berishdan yaxshiroq.
- Ba'zan professor ishonchni tekshirish uchun "Haqiqatan ham o'qimoqchimisiz?" deb ikkinchi marta so'rashi mumkin — bunga xuddi birinchi javobingizdagidek izchil va ishonch bilan javob bering.
- Har bir javobda quyidagi formuladan foydalaning: **Hozirgi holat → Sababi → Kelajak rejasi** (Present → Reason → Future).

- **Eng ko'p beriladigan savollar:**`;

    const newAnswer = row.answer.replace(anchor, insertion);

    const keywords = new Set(JSON.parse(row.keywords));
    ["kiyim", "kiyinish", "stress", "tayyorgarlik royxati", "hujjatlar", "internet", "kamera"].forEach(k => keywords.add(k));
    const aliases = new Set(JSON.parse(row.aliases));
    ["suhbatga nima kiyish kerak", "suhbatdan oldin qanday tayyorlanish kerak", "suhbatda stress"].forEach(a => aliases.add(a));

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ?, keywords = ?, aliases = ? WHERE id = 10`,
        args: [newAnswer, JSON.stringify([...keywords]), JSON.stringify([...aliases])]
    });
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
