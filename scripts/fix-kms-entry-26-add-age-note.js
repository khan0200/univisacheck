const db = require('../lib/db');

// User-provided field knowledge: 7-band rejections (purpose of visit not
// sufficiently explained) are often correlated with the applicant's age
// being on the higher side (Embassy views an older applicant's stated
// study purpose more skeptically). Adding this as an explicit note under
// the 7-band section of KMS entry id=26, plus retrieval keywords.

const oldBlock = `**7-band:** Siz tashrif maqsadingizni to'liq yoritib bera olmadingiz.
(Nega Koreyaga borayotganingiz, o'qish rejangiz (Study Plan) yetarlicha ishonarli/mantiqiy asoslanmagan.)`;

const newBlock = `**7-band:** Siz tashrif maqsadingizni to'liq yoritib bera olmadingiz.
(Nega Koreyaga borayotganingiz, o'qish rejangiz (Study Plan) yetarlicha ishonarli/mantiqiy asoslanmagan.)
⚠️ **Yosh omili:** 7-band bilan rad etilishga ko'pincha talabaning YOSHI KATTALIGI ham sabab bo'lishi mumkin — elchixona yoshi kattaroq (masalan 27-30+ yosh) arizachining "nega aynan hozir, nega bu yoshda o'qishga ketmoqchi" degan savoliga Study Planda ishonarli javob bo'lmasa, buni haqiqiy o'qish maqsadidan ko'ra boshqa niyat (masalan ishlash) bor deb shubha bilan qaraydi. Yoshi katta talabalarga maslahat: Study Planda nega aynan shu yoshda va nega hozir o'qishga qaror qilgani (masalan, ish tajribasi orqali aniq maqsad topgani, moliyaviy mustaqil bo'lgani) alohida va ishonarli asoslanishi SHART.`;

async function fix() {
    console.log("Updating KMS record ID 26 (7-band age note)...");
    const current = await db.execute({ sql: `SELECT answer, keywords, aliases FROM ai_knowledge WHERE id = 26` });
    const row = current.rows[0];

    if (!row.answer.includes(oldBlock)) {
        console.error("Expected 7-band block not found verbatim — aborting to avoid corrupting the entry.");
        process.exit(1);
    }
    const newAnswer = row.answer.replace(oldBlock, newBlock);

    const keywords = new Set(JSON.parse(row.keywords));
    ["yosh", "yoshi katta", "yoshi kattaligi", "27 yosh", "30 yosh", "yosh chegarasi"].forEach(k => keywords.add(k));

    const aliases = new Set(JSON.parse(row.aliases));
    ["yoshim katta bo'lgani uchun otkaz", "7-band yosh sababli", "yoshi katta talaba viza"].forEach(a => aliases.add(a));

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ?, keywords = ?, aliases = ? WHERE id = 26`,
        args: [newAnswer, JSON.stringify([...keywords]), JSON.stringify([...aliases])]
    });
    console.log("KMS record ID 26 updated successfully.");
}

fix().catch(e => { console.error(e); process.exit(1); });
