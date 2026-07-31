const db = require('../lib/db');

// Systematic retrieval audit: tested all 31 KMS entries against natural,
// casually-phrased Uzbek queries (not copies of the stored question text).
// 10 entries failed to surface in the top-3 results at all; this script
// adds the missing keywords/aliases so real user phrasing actually finds
// them. Existing terms are preserved; new ones are merged in (deduped).

const fixes = [
    {
        id: 1,
        keywords: ["shans", "foiz", "ehtimol", "chiqadimi", "aniqlash"],
        aliases: ["viza olish shansim qancha", "viza chiqish ehtimoli", "vizam chiqadimi necha foiz"]
    },
    {
        id: 6,
        keywords: ["nega", "tahlil", "sabab nima"],
        aliases: ["nega vizam rad etildi", "vizam nega otkaz boldi", "otkaz tahlili qilib bering", "nega otkaz oldim"]
    },
    {
        id: 7,
        keywords: ["ishsiz", "ish yoq", "dehqon", "fermerlik", "rasmiy ish yoq"],
        aliases: ["otam ishlamaydi viza chiqadimi", "ota-onam rasmiy ishlamaydi", "ishsiz bolsa viza olsa boladimi"]
    },
    {
        id: 8,
        keywords: ["qogoz", "zarur hujjatlar", "royxat"],
        aliases: ["viza uchun qanday qogozlar kerak", "kerakli hujjatlar royxati"]
    },
    {
        id: 9,
        keywords: ["tayyor", "natija", "chiqdimi", "bilaman"],
        aliases: ["vizam tayyor bolganini qanday bilaman", "viza natijasi chiqdimi"]
    },
    {
        id: 11,
        keywords: ["intervyu"],
        aliases: ["elchixonada intervyu boladimi"]
    },
    {
        id: 12,
        keywords: ["murojaat", "yordam sorayman", "firma"],
        aliases: ["qaysi agentlikka murojaat qilsam boladi", "yaxshi konsalting tavsiya qiling"]
    },
    {
        id: 18,
        keywords: ["ishlasam", "part-time", "talaba ishi"],
        aliases: ["oqiyotganda ishlasam boladimi", "talaba part-time ishlay oladimi"]
    },
    {
        id: 20,
        keywords: ["dasturchilik", "IT yonalishi", "narx solishtirish", "arzon universitet"],
        aliases: ["qaysi universitet arzon", "dasturchilik yonalishi narxi"]
    },
    {
        id: 24,
        keywords: ["18 yosh", "bolam", "voyaga yetmagan", "notarial rozilik"],
        aliases: ["18 yoshga tolmagan bola vizaga chiqadimi", "voyaga yetmagan bolaga viza"]
    },
    {
        id: 28,
        keywords: ["qaytadan", "yana urinish", "qayta topshirish"],
        aliases: ["bir marta otkaz olgan bolsam qaytadan urinsam boladimi", "otkazdan keyin qayta ariza"]
    }
];

async function run() {
    console.log("Enriching keywords/aliases for entries that failed retrieval audit...");
    for (const fix of fixes) {
        const current = await db.execute({ sql: `SELECT keywords, aliases FROM ai_knowledge WHERE id = ?`, args: [fix.id] });
        if (current.rows.length === 0) { console.log(`id=${fix.id} not found, skipping.`); continue; }
        const row = current.rows[0];
        const keywords = new Set(JSON.parse(row.keywords));
        fix.keywords.forEach(k => keywords.add(k));
        const aliases = new Set(JSON.parse(row.aliases));
        fix.aliases.forEach(a => aliases.add(a));

        await db.execute({
            sql: `UPDATE ai_knowledge SET keywords = ?, aliases = ? WHERE id = ?`,
            args: [JSON.stringify([...keywords]), JSON.stringify([...aliases]), fix.id]
        });
        console.log(`id=${fix.id} updated.`);
    }
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
