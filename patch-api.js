const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'api', 'ai-assistant.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace 1
content = content.replace(
    `const axios = require('axios');\nconst path = require('path');\nconst IntentAnalyzer = require('../lib/ai/intent-analyzer');\nconst UniversityService = require('../lib/university-service');\n\nconst ALLOWED_ORIGINS = [`,
    `const axios = require('axios');\nconst path = require('path');\nconst IntentAnalyzer = require('../lib/ai/intent-analyzer');\nconst UniversityService = require('../lib/university-service');\nconst KnowledgeProcessor = require('../lib/ai/knowledge-processor');\nconst KnowledgeRetriever = require('../lib/ai/knowledge-retriever');\n\nconst ALLOWED_ORIGINS = [`
);

// Replace 2
const oldIntentBlock = `        if (!message) {
            res.status(400).json({ error: 'Missing message parameter' });
            return;
        }

        // 1. Analyze Intent
        const analysis = await IntentAnalyzer.analyze(message);`;

const newIntentBlock = `        if (!message) {
            res.status(400).json({ error: 'Missing message parameter' });
            return;
        }

        // Admin Auth & Commands
        let isAdmin = false;
        const adminSecret = process.env.ADMIN_SECRET || 'secret_admin_123';
        
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
        const analysis = await IntentAnalyzer.analyze(message);`;

content = content.replace(oldIntentBlock, newIntentBlock);

// Replace 3
const oldPromptBlock = `        if (analysis.intent === 'visa_calc' || analysis.visa_related) {
            // Keep visa rules in prompt implicitly (it's already in the system prompt text below)
        }        const systemPrompt = \``;

const newPromptBlock = `        if (analysis.intent === 'visa_calc' || analysis.visa_related) {
            // Keep visa rules in prompt implicitly (it's already in the system prompt text below)
        }

        // Fetch KMS Knowledge
        const kmsRecords = await KnowledgeRetriever.retrieve(analysis.intent, analysis.keywords, message);
        let kmsContext = "";
        if (kmsRecords.length > 0) {
            kmsContext = \`\\n== BAZADAGI QO'SHIMCHA MA'LUMOTLAR ==\\n\` + kmsRecords.map(r => \`Savol: \${r.question}\\nJavob: \${r.answer}\`).join('\\n\\n') + \`\\n== BAZA TUGADI ==\\n\`;
        }
        dynamicContext += kmsContext;

        const systemPrompt = \``;

content = content.replace(oldPromptBlock, newPromptBlock);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched api/ai-assistant.js successfully');
