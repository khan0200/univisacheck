const db = require('../lib/db');

// Entry id=10 ("interview prep tips") contradicted entry id=11 ("no embassy
// interview for D-2/D-4 visas"). id=10 is actually about UNIVERSITY admission
// interviews (some Korean universities do an online interview as part of the
// admission decision, before the student ever applies for a visa) — a
// separate process from the Embassy's visa document review. Clarifying this
// explicitly so the AI doesn't give contradictory answers about "interview".

async function fix() {
    console.log("Updating KMS record ID 10...");
    try {
        await db.execute({
            sql: `UPDATE ai_knowledge
                  SET question = ?,
                      answer = ?,
                      keywords = ?,
                      aliases = ?
                  WHERE id = 10`,
            args: [
                "Universitetga qabul suhbatiga (interview) qanday tayyorlanish kerak?",
                `## MUHIM FARQ: UNIVERSITET QABUL SUHBATI vs ELCHIXONA VIZA JARAYONI
DIQQAT: Bu quyidagi maslahatlar UNIVERSITETNING QABUL JARAYONIDAGI suhbatga (ba'zi universitetlar onlayn interview orqali abituriyentni baholaydi) tegishli. Bu Koreya ELCHIXONASIDAGI VIZA JARAYONIDAN BUTUNLAY BOSHQA narsa — D-2/D-4 talaba vizasi uchun elchixonada HECH QANDAY suhbat (interview) BO'LMAYDI (qarang: "viza uchun suhbat bo'ladimi?"). Foydalanuvchi "viza suhbati" yoki "elchixona suhbati" desa, unga elchixonada suhbat yo'qligini ayting. Foydalanuvchi "universitetga qabul suhbati" yoki "onlayn interview" desa, quyidagi maslahatlarni bering.

## UNIVERSITET QABUL SUHBATIGA TAYYORGARLIK MASLAHATLARI
Koreya universitetining QABUL JARAYONIDA suhbatga (interview) tayyorgarlik ko'rayotgan talabaga quyidagi maslahatlarni bering:
- **Texnik tayyorgarlik:** Kamera va yorug'lik toza bo'lishi, orqa fon betartib bo'lmasligi kerak. Internetni tekshiring.
- **Suhbat jarayoni:** Quloq soling va savolni to'liq tushuning. Tushunmasangiz "Could you repeat the question, please?" deb so'rang. Kameraga qarab gapiring.
- **Javob berish usuli:** Sekin, ravon va sodda gapiring. Juda murakkab iboralar ishlatsangiz suhbatda shubha paydo bo'ladi (TIL DARAJANGIZGA MOS gapiring, masalan TOPIK 2 bo'lsa sodda gaplar). Har doim mantiqli javob bering (Hozirgi holat -> Sababi -> Kelajak rejasi).
- **Asosiy qoidalar:** Study Planda yozganingizga ZID gap aytmang. Moliyaviy savollarga aniq (masalan, "Ota-onam to'liq qoplaydi") deb javob bering, ikkilanmang. Asl niyatingiz faqat O'QISH ekanini uqtiring (noqonuniy ishlash niyati yo'qligini). Iloji boricha tabassum qiling va suhbat oxirida minnatdorchilik bildiring.
- **Eng ko'p beriladigan savollar:** O'zingizni tanishtiring? Nima uchun Koreya? Nima uchun aynan shu universitet va major? Bitirgandan keyingi rejangiz (Koreyada yashab qolaman demang, O'zbekistonga qaytishni ayting)? Moliyalashtirish kim tomondan? Bularni yodlab emas, tushunib aytish kerak.`,
                JSON.stringify(["universitet", "qabul", "suhbat", "interview", "onlayn", "tayyorgarlik"]),
                JSON.stringify(["universitet qabul suhbati", "onlayn interview", "universitetga interview tayyorgarlik"])
            ]
        });
        console.log("KMS record ID 10 updated successfully.");
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

fix().catch(console.error);
