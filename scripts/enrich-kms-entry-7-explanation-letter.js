const db = require('../lib/db');

// The user shared a more detailed "Bright Future Consulting" 8-band
// explanatory letter template, which turned out to closely match KMS id=7's
// existing template (same 3 reasons: unreported income, real estate under
// grandparents' name, vehicle under power of attorney) -- so no new entry
// is needed. What id=7 lacked: an explicit warning that explanation letters
// carry the same plagiarism/copy-paste risk as Study Plans (currently only
// warned about in id=4), and search keywords for "tushuntirish xati" /
// "explanation letter" phrasing.

async function run() {
    console.log("Enriching KMS entry id=7 (explanation letter plagiarism warning + keywords)...");
    const current = await db.execute({ sql: `SELECT answer, keywords, aliases FROM ai_knowledge WHERE id = 7` });
    const row = current.rows[0];

    const anchor = `========================================================`;
    const lastAnchorIndex = row.answer.lastIndexOf(anchor);
    if (lastAnchorIndex === -1) throw new Error('closing anchor not found');
    if (row.answer.includes('TUSHUNTIRISH XATINI HECH QACHON BOSHQA TALABADAN')) {
        console.log('Already present, skipping.');
        return;
    }

    const warning = `\r\n\r\n## ⚠️ TUSHUNTIRISH XATI HAM PLAGIAT XAVFIGA EGA\r\nTushuntirish xati (Explanation Letter) — xuddi Study Plan kabi — talabaning O'Z REAL holatiga moslab yozilishi SHART. TUSHUNTIRISH XATINI HECH QACHON BOSHQA TALABADAN yoki tayyor namunadan O'ZGARTIRMASDAN NUSXA KO'CHIRISH kerak emas — bu xuddi Study Plan plagiati kabi elchixonaning shubhasini uyg'otadi va qayta topshirishda ham rad etilish xavfini oshiradi. Yuqoridagi shablonlar faqat TUZILISH NAMUNASI — talaba o'zining aniq raqamlari, hujjatlari va holatiga moslab qayta yozishi shart.\r\n\r\n${anchor}`;

    const newAnswer = row.answer.slice(0, lastAnchorIndex) + warning;

    const keywords = new Set(JSON.parse(row.keywords));
    ["tushuntirish xati", "explanation letter", "qayta topshirish xati", "8-band xat", "uzr xati"].forEach(k => keywords.add(k));
    const aliases = new Set(JSON.parse(row.aliases));
    ["tushuntirish xati qanday yoziladi", "8-band uchun tushuntirish xati", "otkazdan keyin qayta topshirish xati"].forEach(a => aliases.add(a));

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ?, keywords = ?, aliases = ? WHERE id = 7`,
        args: [newAnswer, JSON.stringify([...keywords]), JSON.stringify([...aliases])]
    });
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
