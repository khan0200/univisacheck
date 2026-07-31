const db = require('../lib/db');

// The user shared a "Bright Future Consulting" apology letter for
// forged-document rejections via a consulting agency's negligence -- its
// content already matches KMS id=7's existing "Konsalting/Agentlik xatosi
// (Soxta hujjat)" template almost word for word, so no new entry needed.
// What was missing: that section was never explicitly labeled as the
// template for 6-band rejections specifically (the most severe band, per
// id=26 -- forged document suspicion, real blacklist risk), so a student
// asking about "6-band" specifically couldn't find it. Labels it and adds
// retrieval keywords.

async function run() {
    console.log("Labeling KMS id=7's consulting-error template as 6-band, adding keywords...");
    const current = await db.execute({ sql: `SELECT answer, keywords, aliases FROM ai_knowledge WHERE id = 7` });
    const row = current.rows[0];

    const anchor = `### 3. Konsalting/Agentlik xatosi (Soxta hujjat) uchun Uzr xati:`;
    if (!row.answer.includes(anchor)) throw new Error('anchor not found');
    if (row.answer.includes('6-band bilan bog\'liq')) {
        console.log('Already labeled, skipping.');
        return;
    }

    const replacement = `### 3. Konsalting/Agentlik xatosi (Soxta hujjat) uchun Uzr xati — 6-BAND bilan bog'liq (ENG XAVFLI BAND):`;
    const newAnswer = row.answer.replace(anchor, replacement);

    const keywords = new Set(JSON.parse(row.keywords));
    ["6-band", "6-band xat", "soxta hujjat gumoni"].forEach(k => keywords.add(k));
    const aliases = new Set(JSON.parse(row.aliases));
    ["6-band uchun tushuntirish xati", "6-band bilan otkaz olgan talaba xat", "soxta hujjat sababli otkaz uzr xati"].forEach(a => aliases.add(a));

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ?, keywords = ?, aliases = ? WHERE id = 7`,
        args: [newAnswer, JSON.stringify([...keywords]), JSON.stringify([...aliases])]
    });
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
