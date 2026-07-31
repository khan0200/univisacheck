const db = require('../lib/db');

// The user shared a fuller "Bright Future Consulting" 7-band explanation
// letter template. It matches KMS id=7's existing 7-band template almost
// exactly (points 1-4 are the same: work experience, financial
// independence, conscious decision to return, language prep) -- so no new
// entry is needed. The one genuinely missing point: an explicit "why Korea
// specifically" section, which the source doc lists as its own numbered
// item (5).

async function run() {
    console.log("Adding 'why Korea' point to KMS entry id=7's 7-band template...");
    const current = await db.execute({ sql: `SELECT answer FROM ai_knowledge WHERE id = 7` });
    const row = current.rows[0];

    const anchor = `  4) Til o'rganish va akademik tayyorgarlik (shu davrda til o'rganib, TOPIK/IELTS olgani).\r\n- **Xulosa:**`;
    if (!row.answer.includes(anchor)) throw new Error('anchor not found');
    if (row.answer.includes('5) Koreyani aynan tanlash sabablari')) {
        console.log('Already present, skipping.');
        return;
    }

    const replacement = `  4) Til o'rganish va akademik tayyorgarlik (shu davrda til o'rganib, TOPIK/IELTS olgani).\r\n  5) Koreyani aynan tanlash sabablari (ta'lim sifati, amaliyotga yo'naltirilgan dasturlar, tanlagan yo'nalish bo'yicha Koreyada kuchli ta'lim mavjudligi — umumiy "Koreya yoqadi" emas, aniq sabab yozilishi kerak).\r\n- **Xulosa:**`;

    const newAnswer = row.answer.replace(anchor, replacement);

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ? WHERE id = 7`,
        args: [newAnswer]
    });
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
