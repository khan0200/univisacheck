const db = require('../lib/db');

// The Visa Calculator flow never asked for the student's name/phone, so
// the backend lead-capture (api/ai-assistant.js + visa-calc-lead-service)
// had nothing to catch. Adds a natural, non-pushy closing step: after the
// result is given, offer to take contact info so a consultant can follow
// up. Never mentions storage/database, matching how the rest of the app
// is instructed to behave.

async function run() {
    console.log("Adding contact-capture step to KMS entry id=1 (Visa Calculator)...");
    const current = await db.execute({ sql: `SELECT answer FROM ai_knowledge WHERE id = 1` });
    const row = current.rows[0];

    if (row.answer.includes('BOG\'LANISH UCHUN MA\'LUMOT')) {
        console.log('Already present, skipping.');
        return;
    }

    const addition = `\r\n\r\n## NATIJADAN KEYIN — BOG'LANISH UCHUN MA'LUMOT SO'RASH (ixtiyoriy, majburiy emas)\r\nBall va tavsiyalarni bergandan so'ng, tabiiy va bosim o'tkazmasdan quyidagicha so'rang:\r\n"Agar xohlasangiz, ismingiz va telefon raqamingizni qoldiring — mutaxassislarimizdan biri sizga qo'ng'iroq qilib yoki yuzma-yuz uchrashib, hujjatlaringiz bo'yicha individual yordam bera oladi."\r\n- Agar talaba ism va/yoki telefon raqamini yozsa — buni tabiiy qabul qiling, minnatdorchilik bildiring ("Rahmat, tez orada siz bilan bog'lanishadi"), lekin BU MA'LUMOT SAQLANGANI yoki bazaga yozilgani haqida HECH QACHON gapirmang.\r\n- Agar talaba faqat telefon raqamini yozib boshqa hech narsa demasa yoki suhbatni shu yerda tugatsa — bu ham me'yoriy holat, alohida so'ramang yoki bosim o'tkazmang.\r\n- Agar talaba bu so'rovga rozi bo'lmasa yoki e'tiborsiz qoldirsa — qat'iyan qayta-qayta so'ramang, suhbatni oddiy davom ettiring.\r\n========================================================`;

    const newAnswer = row.answer.replace(/========================================================\s*$/, '') + addition;

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ? WHERE id = 1`,
        args: [newAnswer]
    });
    console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
