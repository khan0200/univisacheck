const db = require('../lib/db');

async function fix() {
    console.log("Updating KMS record ID 11...");
    try {
        await db.execute({
            sql: `UPDATE ai_knowledge 
                  SET question = ?, 
                      answer = ?, 
                      language = 'uz', 
                      keywords = ?, 
                      aliases = ? 
                  WHERE id = 11`,
            args: [
                "viza uchun suhbat bo'ladimi?",
                "Yo'q, Koreya talaba vizalari (D-2 va D-4) uchun elchixonada suhbat (interview) bo'lmaydi. Viza olish jarayonida suhbat o'tkazilmaydi, asosiy e'tibor taqdim etilgan o'quv rejasiga (Study Plan) va moliyaviy hujjatlarga qaratiladi.",
                JSON.stringify(["suhbat", "interview", "viza", "d-2", "d-4", "elchixona"]),
                JSON.stringify(["viza uchun suhbat", "suhbat bo'ladimi", "elchixona suhbati"])
            ]
        });
        console.log("KMS record updated successfully.");
    } catch (e) {
        console.error(e);
    }
}

fix().catch(console.error);
