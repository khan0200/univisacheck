const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../api/ai-assistant.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF for parsing
content = content.replace(/\r\n/g, '\n');

// 1. Replace imports at the top
const oldImports = `const axios = require('axios');\nconst path = require('path');\n\nconst ALLOWED_ORIGINS = [`;
const newImports = `const axios = require('axios');
const path = require('path');
const IntentAnalyzer = require('../lib/ai/intent-analyzer');
const UniversityService = require('../lib/university-service');
const KnowledgeProcessor = require('../lib/ai/knowledge-processor');
const KnowledgeRetriever = require('../lib/ai/knowledge-retriever');

const ALLOWED_ORIGINS = [`;

content = content.replace(oldImports, newImports);

// 2. Locate the logic after message validation
const startRemovalStr = `        let unis = {};`;
const endRemovalStr = `        const systemPrompt = \``;

const startIdx = content.indexOf(startRemovalStr);
const endIdx = content.indexOf(endRemovalStr);

if (startIdx === -1 || endIdx === -1) {
    console.error("Failed to locate target logic blocks!");
    process.exit(1);
}

// The new dynamic logic block
const newDynamicLogic = `        // Configuration and Secrets
        let adminSecret = 'secret_admin_123';
        try {
            const tursoConfig = require(path.join(__dirname, '..', 'turso.config.js'));
            if (tursoConfig.ADMIN_SECRET) adminSecret = tursoConfig.ADMIN_SECRET;
        } catch (_) {}

        // Admin Session & Authentication
        let isAdmin = false;
        if (message.startsWith('/login ')) {
            const token = message.split(' ')[1];
            if (token === adminSecret) {
                res.status(200).json({ response: "✅ **Admin tizimga kirdi!** Endi \`/savol\`, \`/javob\` buyruqlaridan foydalanishingiz mumkin." });
                return;
            }
        }
        
        for (const msg of history) {
            if (msg.role === 'user' && msg.content.startsWith('/login ')) {
                const token = msg.content.split(' ')[1];
                if (token === adminSecret) isAdmin = true;
            }
        }

        if (isAdmin) {
            if (message.startsWith('/savol ')) {
                res.status(200).json({ response: "✅ **Savol qabul qilindi.** Endi iltimos, javobni \`/javob <matn>\` shaklida yuboring." });
                return;
            } else if (message.startsWith('/javob ')) {
                let lastSavol = null;
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].role === 'user' && history[i].content.startsWith('/savol ')) {
                        lastSavol = history[i].content.replace('/savol ', '').trim();
                        break;
                    }
                }
                
                if (!lastSavol) {
                    res.status(200).json({ response: "❌ Xatolik: Oldingi \`/savol\` topilmadi." });
                    return;
                }
                
                const answer = message.replace('/javob ', '').trim();
                const result = await KnowledgeProcessor.processAndSave(lastSavol, answer, "admin");
                
                if (result.status === 'success') {
                    res.status(200).json({ 
                        response: \`✅ **Ma'lumot saqlandi!** (ID: \${result.id})\\n\\n**Savol:** \${result.metadata.improved_question}\\n**Javob:** \${result.metadata.improved_answer}\\n**Teglar:** \${result.metadata.keywords.join(', ')}\`
                    });
                } else {
                    res.status(200).json({ response: \`ℹ️ **Natija:** \${result.message}\` });
                }
                return;
            }
        }

        // 1. Analyze Intent
        const analysis = await IntentAnalyzer.analyze(message);
        console.log("Intent Analysis:", analysis);

        // 2. Fetch Relevant Data dynamically from Turso
        let dynamicContext = "";
        let isPureFactual = analysis.intent === 'factual_lookup' && analysis.attribute && analysis.entities.length === 1;

        // Fetch university data if mentioned
        if (analysis.entities && analysis.entities.length > 0) {
            const unis = await UniversityService.getUniversitiesForComparison(analysis.entities);
            if (unis && unis.length > 0) {
                if (isPureFactual) {
                    const uni = unis[0];
                    const attr = analysis.attribute;
                    let answer = "";
                    if (attr === 'tuition') answer = \`\${uni.name} kontrakt narxi: \${uni.tuition}\`;
                    else if (attr === 'app_fee') answer = \`\${uni.name} application fee: \${uni.app_fee}\`;
                    else if (attr === 'location') answer = \`\${uni.name} joylashuvi: \${uni.location}, \${uni.address}\`;
                    else if (attr === 'qs_rank') answer = \`\${uni.name} QS reytingi: \${uni.qs_rank}\`;
                    else if (attr === 'language') answer = \`\${uni.name} til talabi: \${uni.language}\`;
                    else isPureFactual = false; // fallback

                    if (isPureFactual && answer) {
                        res.status(200).json({ response: answer });
                        return;
                    }
                }
                dynamicContext += \`\\n== RELEVANT UNIVERSITIES DATA ==\\n\${JSON.stringify(unis, null, 2)}\\n== END RELEVANT DATA ==\\n\`;
            }
        }

        // Fetch 1% list if user asks for it
        if (message.includes('1%') || message.toLowerCase().includes('yengil') || (analysis.intent === 'university_info' && analysis.entities.length === 0)) {
            const onePercentUnis = await UniversityService.get1PercentUniversities();
            if (onePercentUnis && onePercentUnis.length > 0) {
                dynamicContext += \`\\n== 1% (YENGILLASHTIRILGAN) UNIVERSITETLAR RO'YXATI (DATABASE) ==\\n\`;
                onePercentUnis.forEach((u, i) => {
                    dynamicContext += \`\${i+1}. \${u.name} (\${u.korean_name}) - \${u.qs_rank || 'Top'}\\n\`;
                });
                dynamicContext += \`\\n== TUGADI ==\\n\`;
            }
        }

        // Fetch KMS Knowledge base content
        const kmsRecords = await KnowledgeRetriever.retrieve(analysis.intent, analysis.keywords, message);
        if (kmsRecords && kmsRecords.length > 0) {
            dynamicContext += \`\\n== BAZADAGI QO'SHIMCHA MA'LUMOTLAR ==\\n\` + kmsRecords.map(r => \`Savol: \${r.question}\\nJavob: \${r.answer}\`).join('\\n\\n') + \`\\n== BAZA TUGADI ==\\n\`;
        }

        const systemPrompt = \``;

content = content.slice(0, startIdx) + newDynamicLogic + content.slice(endIdx + endRemovalStr.length);

// 3. Remove the old JSON database block inside systemPrompt
const databaseBlockOld = `== UNIVERSITETLAR MA'LUMOTLAR BAZASI ==
\${JSON.stringify(unis, null, 2)}
== MA'LUMOTLAR BAZASI TUGADI ==`;

const newDatabaseBlock = `\${dynamicContext}`;
content = content.replace(databaseBlockOld, newDatabaseBlock);

// 4. Remove the hardcoded 1% list block
const hardcodedStart = `- **1% (YENGILLASHTIRILGAN) UNIVERSITETLAR RO'YXATI**:`;

// Find start
const hsIdx = content.indexOf(hardcodedStart);
if (hsIdx !== -1) {
    // Find where the next list point (e.g. [3] QISQA VA ANIQ JAVOB BER) starts to remove up to it
    const searchTarget = `[3] QISQA VA ANIQ JAVOB BER`;
    const searchTargetIdx = content.indexOf(searchTarget);
    
    if (searchTargetIdx !== -1) {
        const replacementInstruction = `- **1% (YENGILLASHTIRILGAN) UNIVERSITETLAR RO'YXATI**: Ushbu universitetlar ro'yxati bazadan olinadi (dynamicContext-ga qara). Boshqa barcha universitetlar STANDART VIZA TEKSHIRUVI guruhiga kiradi. Ularni HECH QACHON 1% yengillashtirilgan deb atama!\n\n`;
        content = content.slice(0, hsIdx) + replacementInstruction + content.slice(searchTargetIdx);
        console.log("Successfully removed hardcoded 1% list.");
    } else {
        console.error("Could not find '[3] QISQA VA ANIQ JAVOB BER' inside prompt!");
    }
} else {
    console.error("Could not find hardcoded 1% list start!");
}

// Convert back to CRLF for Windows compatibility
content = content.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Finished patching successfully.");
