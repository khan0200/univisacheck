const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../api/ai-assistant.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the hardcoded list
const startStr = `- **1% (YENGILLASHTIRILGAN) UNIVERSITETLAR RO'YXATI**:`;
const endStr = `  2. KYUNGBOK UNIVERSITY\n  3. ULSAN COLLEGE`;

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr) + endStr.length;

if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx) + content.slice(endIdx);
} else {
    console.error("Could not find hardcoded 1% list string block.");
}

// 2. Inject dynamic lookup
// We will look for: const systemPrompt = `
const injectTarget = `        const systemPrompt = \``;
const dynamicFetchLogic = `        
        // Dynamically fetch 1% universities if requested
        if (message.includes('1%') || message.toLowerCase().includes('yengil') || (analysis.intent === 'university_info' && analysis.entities.length === 0)) {
            const onePercentUnis = await UniversityService.get1PercentUniversities();
            if (onePercentUnis && onePercentUnis.length > 0) {
                dynamicContext += \`\\n\\n== 1% (YENGILLASHTIRILGAN) UNIVERSITETLAR RO'YXATI (DATABASE) ==\\n\`;
                onePercentUnis.forEach((u, i) => {
                    dynamicContext += \`\${i+1}. \${u.name} (\${u.korean_name}) - \${u.qs_rank || 'Top'}\\n\`;
                });
                dynamicContext += \`\\n== TUGADI ==\\n\`;
            }
        }
        
        const systemPrompt = \``;

content = content.replace(injectTarget, dynamicFetchLogic);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched ai-assistant.js to remove hardcoded 1% list and add dynamic DB lookup.');
