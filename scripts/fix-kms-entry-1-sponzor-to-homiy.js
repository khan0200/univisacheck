const db = require('../lib/db');

// KMS id=1 (Visa Calculator) used "sponzor" (a Russian-loanword spelling)
// as its primary term throughout, while every other entry correctly uses
// the native Uzbek word "homiy" (with "(sponsor)" only as a parenthetical
// English gloss for clarity, e.g. in id=5/id=8). Fixes the inconsistency.
//
// Substring replacement cascades correctly onto inflected forms:
// "Sponzorning" -> "Homiyning" (genitive), "sponzorlik" -> "homiylik"
// (matches the existing correct term "homiylik" already used in id=7).

async function run() {
    console.log("Fixing sponzor -> homiy in KMS entry id=1...");
    const current = await db.execute({ sql: `SELECT answer FROM ai_knowledge WHERE id = 1` });
    const row = current.rows[0];

    const before = (row.answer.match(/sponz\w*/gi) || []).length;
    if (before === 0) {
        console.log("No 'sponzor' occurrences found, nothing to do.");
        return;
    }

    const newAnswer = row.answer
        .replace(/Sponzor/g, 'Homiy')
        .replace(/sponzor/g, 'homiy');

    const after = (newAnswer.match(/sponz\w*/gi) || []).length;
    console.log(`Replaced ${before} occurrence(s), ${after} remaining.`);

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ? WHERE id = 1`,
        args: [newAnswer]
    });
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
