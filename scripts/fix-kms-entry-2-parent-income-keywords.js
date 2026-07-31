const db = require('../lib/db');

// Entry id=2 holds the "3-4 million so'm oylik" parent-income guidance, but
// its keywords/aliases (embassy, elchixona, d-2, d-4, viza qoidalari,
// talablar) never match how students actually phrase the question
// ("dadamning oyligi qancha", "ota-onamda qancha pul bo'lishi kerak", etc).
// Adding the missing terms so the retriever's LIKE-based scoring picks this
// entry up for those natural-language variants.

async function fix() {
    console.log("Updating KMS record ID 2 keywords/aliases...");
    try {
        const current = await db.execute({
            sql: `SELECT keywords, aliases FROM ai_knowledge WHERE id = 2`
        });
        const row = current.rows[0];
        const keywords = new Set(JSON.parse(row.keywords));
        const aliases = new Set(JSON.parse(row.aliases));

        ["dadam", "onam", "otam", "sponsor", "oylik", "maosh", "ish haqi", "daromad", "moliyaviy"]
            .forEach(k => keywords.add(k));

        [
            "dadamning oyligi qancha bo'lishi kerak",
            "onamning oyligi qancha bo'lishi kerak",
            "ota-onamda qancha pul bo'lishi kerak",
            "dadamda qancha pul bo'lishi kerak",
            "onamda qancha pul bo'lishi kerak",
            "sponsor oyligi qancha",
            "ota-ona daromadi qancha bo'lishi kerak"
        ].forEach(a => aliases.add(a));

        await db.execute({
            sql: `UPDATE ai_knowledge SET keywords = ?, aliases = ? WHERE id = 2`,
            args: [JSON.stringify([...keywords]), JSON.stringify([...aliases])]
        });
        console.log("KMS record ID 2 updated successfully.");
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

fix().catch(console.error);
