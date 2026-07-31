const db = require('../lib/db');

// Enriches KMS id=4 (Study Plan rules) with detail from a "Bright Future
// Consulting" reference doc: fuller lists of valid/invalid reasons for each
// section, the 4-point mechanism of why plagiarism specifically triggers
// rejection (not just "it's forbidden"), and the nuance that imperfect but
// authentic English reads better to a consul than suspiciously polished text.
// The existing "must be handwritten with the same pen" requirement in id=4
// is confirmed accurate by the admin and is left untouched.

async function run() {
    console.log("Enriching KMS entry id=4...");
    const current = await db.execute({ sql: `SELECT answer, keywords, aliases FROM ai_knowledge WHERE id = 4` });
    const row = current.rows[0];

    const nl = (s) => s.replace(/\n/g, '\r\n');

    const oldWhyKorea = nl(`2. **Why Korea? (Nima uchun Koreya?)**: Aniq, mantiqiy va real sabablar (iqtisodiyot, ta'lim sifati, texnologiya). "K-pop yoqadi" yoki "Menga Koreya yoqadi" kabi sabablar viza uchun O'TMAYDI.
3. **Why this University? (Nima uchun aynan shu universitet?)**: Universitet reytingi, professorlar, amaliyot bazalari haqida aniq faktlar. "Universitet yaxshi ekan" degan umumiy gaplar yetarli emas.`);

    const newWhyKorea = nl(`2. **Why Korea? (Nima uchun Koreya?)**: Aniq, mantiqiy va real sabablar keltirilishi shart. To'g'ri keladigan sabablar: Koreyaning rivojlangan iqtisodiyoti va ta'lim sifati; tanlagan yo'nalish bo'yicha kuchli universitetlar; Koreyaning texnologiya, IT, muhandislik, biznes yoki sog'liqni saqlash sohasidagi yetakchiligi; o'qishdan keyingi amaliyot (internship) imkoniyati; O'zbekiston-Koreya iqtisodiy aloqalarining kengayayotgani va shu aloqalar bilan kelajakda ishlash rejasi. "K-pop yoqadi" yoki "Menga Koreya yoqadi" kabi sabablar viza uchun O'TMAYDI.
3. **Why this University? (Nima uchun aynan shu universitet?)**: Universitet haqida chuqur ma'lumotga egalikni ko'rsatuvchi aniq dalillar: tanlagan yo'nalish bo'yicha universitet reytingi; o'sha yo'nalishdagi mashhur professorlar; laboratoriya, research center yoki amaliyot bazalarining mavjudligi; talabalar amaliyotga boradigan kompaniyalar; kampusdagi xalqaro talabalar uchun sharoitlar. "Universitet yaxshi ekan", "Reytingi yaxshi" kabi umumiy gaplar MUTLAQO YETARLI EMAS.`);

    const oldFuture = nl(`## 🔴 VIZA RAD ETILISHIGA SABAB BO'LADIGAN XATOLAR (QIZIL CHIZIQ)
- **PLAGIAT (Ko'chirmachilik)**: Internetdan yoki boshqa talabalardan ko'chirib yozish QAT'IYAN MAN ETILADI! Koreya universitetlarida AI-plagiarism tekshiruv tizimi mavjud. Plagiat viza rad etilishining eng keng tarqalgan sababidir va talaba "riskli" ro'yxatga tushib qoladi.`);

    const newFuture = nl(`## 🔴 VIZA RAD ETILISHIGA SABAB BO'LADIGAN XATOLAR (QIZIL CHIZIQ)
- **PLAGIAT (Ko'chirmachilik)** — ENG XAVFLI XATO. Nima uchun bunchalik jiddiy oqibatlarga olib keladi:
  1. Koreya universitetlarining KO'PCHILIGI ariza topshirilgan zahoti matnni AVTOMATIK AI-plagiarism tizimida tekshiradi — Study Plan boshqa matnga o'xshab ketsa, darhol "Copied/Similar Text" deb belgilanadi.
  2. Konsul uchun talabaning eng muhim sifati — samimiylik, maqsadning aniqligi va fikrning mustaqilligi. Ko'chirilgan matn "bu talaba reja qilmagan, yolg'on gapiryapti" degan xulosaga olib keladi.
  3. Natijada viza rad etilish ehtimoli JUDA YUQORI bo'ladi.
  4. Bir marta plagiatga tushilsa, talabaning ismi universitetlar va konsullik nazarida "riskli talaba" sifatida qoladi — bu KEYINGI barcha arizalarga ham salbiy ta'sir qiladi.
  - **Muhim maslahat**: Study Plan soddaroq ingliz tilida bo'lsa ham mayli — eng muhimi talabaning O'ZI yozgan bo'lishi. IELTS 4.5-5.5 darajasidagi (mukammal bo'lmagan) insholar konsulga ko'proq ISHONARLI ko'rinadi, chunki bu talabaning HAQIQIY til darajasini ko'rsatadi — g'ayrioddiy darajada "mukammal" til esa shubha uyg'otadi.`);

    let newAnswer = row.answer;
    if (!newAnswer.includes(oldWhyKorea)) throw new Error('oldWhyKorea block not found verbatim');
    if (!newAnswer.includes(oldFuture)) throw new Error('oldFuture block not found verbatim');
    newAnswer = newAnswer.replace(oldWhyKorea, newWhyKorea).replace(oldFuture, newFuture);

    const keywords = new Set(JSON.parse(row.keywords));
    ["plagiat", "plagiarism", "kochirish", "nusxa", "why korea", "why university", "ielts 4.5"].forEach(k => keywords.add(k));
    const aliases = new Set(JSON.parse(row.aliases));
    ["study plan plagiat xavfi", "nega koreya deb yozish kerak", "study plan kochirilsa nima boladi"].forEach(a => aliases.add(a));

    await db.execute({
        sql: `UPDATE ai_knowledge SET answer = ?, keywords = ?, aliases = ? WHERE id = 4`,
        args: [newAnswer, JSON.stringify([...keywords]), JSON.stringify([...aliases])]
    });
    console.log("KMS entry id=4 enriched successfully.");
}

run().catch(e => { console.error(e); process.exit(1); });
