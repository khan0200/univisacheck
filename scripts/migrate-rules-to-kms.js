const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

async function run() {
    console.log("Starting migration of hardcoded rules to KMS...");

    const filePath = path.join(__dirname, '../api/ai-assistant.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // Helper to extract block between two headers
    function extractBlock(startHeader, endHeader) {
        const startIdx = content.indexOf(startHeader);
        if (startIdx === -1) return null;
        
        let endIdx = content.length;
        if (endHeader) {
            const tempIdx = content.indexOf(endHeader, startIdx);
            if (tempIdx !== -1) endIdx = tempIdx;
        }
        
        return content.substring(startIdx, endIdx).trim();
    }

    const sections = [
        {
            header: "== QISM 2: VIZA IMKONIYATI KALKULYATORI (MUHIM FUNKSIYA) ==",
            nextHeader: "== QISM 3: EMBASSY VISA ASSESSMENT (D-2 / D-4) 2026 RULES ==",
            question: "Viza imkoniyati kalkulyatori qoidalari qanday? (Viza imkoniyatini baholash)",
            category: "visa_calc",
            topic: "Visa Calculator",
            keywords: ["kalkulyator", "calculator", "viza imkoniyati", "ball", "baholash"],
            aliases: ["kalkulyator", "viza ball", "viza tekshirish"]
        },
        {
            header: "== QISM 3: EMBASSY VISA ASSESSMENT (D-2 / D-4) 2026 RULES ==",
            nextHeader: "== QISM 4: VISA TOPSHIRISH TARTIBI VA AGENTLIKLAR ==",
            question: "Koreya elchixonasi viza talablari qanday? (D-2 va D-4 viza qoidalari)",
            category: "visa_calc",
            topic: "Embassy Rules",
            keywords: ["embassy", "elchixona", "d-2", "d-4", "viza qoidalari", "talablar"],
            aliases: ["elchixona qoidalari", "elchixona talablari", "viza hujjatlari"]
        },
        {
            header: "== QISM 4: VISA TOPSHIRISH TARTIBI VA AGENTLIKLAR ==",
            nextHeader: "== QISM 5: STUDY PLAN YOZISH QOIDALARI (ELCHIXONA TALABLARI) ==",
            question: "Viza topshirish tartibi va rasmiy agentliklar qaysilar?",
            category: "visa_calc",
            topic: "Visa Submission",
            keywords: ["agentlik", "visa topshirish", "iom", "vfs", "tartib"],
            aliases: ["agentliklar", "viza topshirish joyi", "iom elchixona"]
        },
        {
            header: "== QISM 5: STUDY PLAN YOZISH QOIDALARI (ELCHIXONA TALABLARI) ==",
            nextHeader: "== QISM 6: KO'P SO'RALADIGAN SAVOLLAR VA MUSTASNO HOLATLAR (FAQ & EDGE CASES) ==",
            question: "Study Plan (O'quv rejasi) va Personal Statement qanday yoziladi?",
            category: "general_advice",
            topic: "Study Plan",
            keywords: ["study plan", "o'quv rejasi", "personal statement", "yozish"],
            aliases: ["study plan", "insho", "maqsadli bayonot"]
        },
        {
            header: "== QISM 6: KO'P SO'RALADIGAN SAVOLLAR VA MUSTASNO HOLATLAR (FAQ & EDGE CASES) ==",
            nextHeader: "== QISM 7: VIZA RAD ETILISHI (OTKAZ) TAHLILI VA YORDAMCHI ==",
            question: "Ko'p so'raladigan savollar va mustasno holatlar (FAQ)",
            category: "general_advice",
            topic: "FAQ",
            keywords: ["faq", "savollar", "savol-javob", "mustasno"],
            aliases: ["faq", "savollar", "muammolar"]
        },
        {
            header: "== QISM 7: VIZA RAD ETILISHI (OTKAZ) TAHLILI VA YORDAMCHI ==",
            nextHeader: "== QISM 8: ADVANCED VISA & FINANCIAL QUESTIONS (MURAKKAB HOLATLAR) ==",
            question: "Viza rad etilishi (otkaz) sabablari va rad etilgandan keyingi tahlil",
            category: "visa_calc",
            topic: "Visa Refusal",
            keywords: ["rad etish", "otkaz", "rejection", "refusal", "sabab"],
            aliases: ["otkaz", "viza rad", "otkaz tahlili"]
        },
        {
            header: "== QISM 8: ADVANCED VISA & FINANCIAL QUESTIONS (MURAKKAB HOLATLAR) ==",
            nextHeader: "== QISM 10: HUJJATLAR TUSHUNTIRISH TIZIMI (DOCUMENT EXPLAINER) ==",
            question: "Moliyaviy hujjatlar va murakkab viza holatlari bo'yicha ma'lumot",
            category: "visa_calc",
            topic: "Financial Rules",
            keywords: ["moliya", "financial", "bank", "homiy", "sponsor", "ish joyi"],
            aliases: ["homiylik", "bank balansi", "daromad"]
        }
    ];

    // Migrate General QISMs
    for (const sec of sections) {
        const text = extractBlock(sec.header, sec.nextHeader);
        if (text) {
            await db.execute({
                sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by)
                      VALUES (?, ?, ?, ?, ?, ?, 'uz', 'system')`,
                args: [
                    sec.question,
                    text,
                    sec.category,
                    sec.topic,
                    JSON.stringify(sec.keywords),
                    JSON.stringify(sec.aliases)
                ]
            });
            console.log(`Migrated: ${sec.topic}`);
        } else {
            console.warn(`Could not extract: ${sec.header}`);
        }
    }

    // Now extract and split QISM 10 (Document Explainer) into individual documents
    const docExplainerText = extractBlock("== QISM 10: HUJJATLAR TUSHUNTIRISH TIZIMI (DOCUMENT EXPLAINER) ==", "## VIZANI VA E-VIZANI TEKSHIRISH");
    if (docExplainerText) {
        // We will save the entire Document Explainer as a fallback
        await db.execute({
            sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by)
                  VALUES (?, ?, 'general_advice', 'Documents List', ?, ?, 'uz', 'system')`,
            args: [
                "Universitet va viza uchun qaysi hujjatlar kerak va ularning tushuntirishi?",
                docExplainerText,
                JSON.stringify(["hujjatlar", "documents", "list", "tushuntirish"]),
                JSON.stringify(["hujjatlar ro'yxati", "hujjatlar ro'yxati viza"])
            ]
        });
        console.log("Migrated: QISM 10 Document Explainer");
    }

    // Extract Visa Check section
    const visaCheckText = extractBlock("## VIZANI VA E-VIZANI TEKSHIRISH (VISA & E-VISA STATUS CHECK)", "## AI UCHUN MAXSUS QOIDALAR");
    if (visaCheckText) {
        await db.execute({
            sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by)
                  VALUES (?, ?, 'visa_calc', 'Visa Check', ?, ?, 'uz', 'system')`,
            args: [
                "Viza va E-Viza holatini qanday tekshirsa bo'ladi? (Visa status check)",
                visaCheckText,
                JSON.stringify(["tekshirish", "status", "check", "e-visa", "koreavizabot"]),
                JSON.stringify(["viza tekshirish", "viza javobi", "e-viza tekshirish"])
            ]
        });
        console.log("Migrated: Visa Check Instructions");
    }

    // Extract Interview Guidelines
    const interviewText = extractBlock("## SUHBATDA (INTERVIEW) NIMALARGA ALOHIDA E'TIBOR BERISH KERAK?", "`;");
    if (interviewText) {
        await db.execute({
            sql: `INSERT INTO ai_knowledge (question, answer, category, topic, keywords, aliases, language, created_by)
                  VALUES (?, ?, 'general_advice', 'Interview Advice', ?, ?, 'uz', 'system')`,
            args: [
                "Universitet yoki elchixona suhbatiga (interview) qanday tayyorlanish kerak?",
                interviewText,
                JSON.stringify(["suhbat", "interview", "savollar", "tayyorgarlik", "maslahat"]),
                JSON.stringify(["interview", "suhbat savollari", "elchixona suhbati"])
            ]
        });
        console.log("Migrated: Interview Advice");
    }

    console.log("Rules migration completed successfully.");
}

run().catch(console.error);
