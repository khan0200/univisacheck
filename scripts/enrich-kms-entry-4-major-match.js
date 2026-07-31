const db = require('../lib/db');

// Adds one more critical, previously-missing rule to KMS id=4: the Study
// Plan's stated major must exactly match the university Admission
// document's major -- a mismatch (e.g. Admission says "Marine Power
// Engineering" but Study Plan says "Tourism Management") reads as the
// student lacking a clear purpose and is a real rejection trigger.

async function run() {
    console.log("Adding major-match rule to KMS entry id=4...");
    const current = await db.execute({ sql: `SELECT answer FROM ai_knowledge WHERE id = 4` });
    const row = current.rows[0];

    const anchor = `## 📝 TEXNIK TALABLAR`;
    const insertion = `## ⚠️ ADMISSION BILAN MOSLIK (JUDA MUHIM)
Study Planda yozilgan yo'nalish (Major) universitet Admission hujjatida ko'rsatilgan yo'nalish bilan AYNAN BIR XIL bo'lishi SHART. Masalan, Admissionda "Marine Power Engineering" deb yozilgan bo'lsa-yu, Study Planda "Tourism Management" haqida yozilsa — elchixona buni "talabaning maqsadi aniq emas" deb talqin qiladi va bu rad etilish sababi bo'ladi. Talabaga har doim: "Admissiondagi major bilan Study Planimdagi major bir xilmi?" deb tekshirishni tavsiya qiling.

${anchor}`;

    if (!row.answer.includes(anchor)) throw new Error('anchor not found');
    if (row.answer.includes('ADMISSION BILAN MOSLIK')) {
        console.log('Already present, skipping.');
        return;
    }
    const newAnswer = row.answer.replace(anchor, insertion);

    const kwRow = await db.execute({ sql: `SELECT keywords, aliases FROM ai_knowledge WHERE id = 4` });
    const keywords = new Set(JSON.parse(kwRow.rows[0].keywords));
    ["admission", "major mos", "yonalish mos emas"].forEach(k => keywords.add(k));
    const aliases = new Set(JSON.parse(kwRow.rows[0].aliases));
    ["study plan admission major mos kelmasa", "admission bilan study plan farqi"].forEach(a => aliases.add(a));

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ?, keywords = ?, aliases = ? WHERE id = 4`,
        args: [newAnswer, JSON.stringify([...keywords]), JSON.stringify([...aliases])]
    });
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
