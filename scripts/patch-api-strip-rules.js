const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../api/ai-assistant.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF for easier parsing
content = content.replace(/\r\n/g, '\n');

// Find start of QISM 2
const qism2Header = `== QISM 2: VIZA IMKONIYATI KALKULYATORI`;
const startIdx = content.indexOf(qism2Header);

// Find start of Special Rules
const specialRulesHeader = `## AI UCHUN MAXSUS QOIDALAR`;
const specialRulesIdx = content.indexOf(specialRulesHeader);

if (startIdx !== -1 && specialRulesIdx !== -1) {
    // Delete everything from QISM 2 start up to Special Rules start
    // We'll leave the separator line before Special Rules for neatness
    content = content.slice(0, startIdx) + content.slice(specialRulesIdx);
    console.log("Successfully removed QISM 2 - 10 rules.");
} else {
    console.error("Could not find start/end markers for rules stripping!");
    process.exit(1);
}

// Find Interview section which is at the end of the prompt
const interviewHeader = `## SUHBATDA (INTERVIEW) NIMALARGA ALOHIDA E'TIBOR BERISH KERAK?`;
const interviewIdx = content.indexOf(interviewHeader);

if (interviewIdx !== -1) {
    // Find the closing backtick of systemPrompt after it
    // The systemPrompt closing is `;` followed by blank lines and `let aiText = '';`
    const targetEnd = `\n\n        let aiText = '';`;
    const endIdx = content.indexOf(targetEnd, interviewIdx);
    
    if (endIdx !== -1) {
        // We replace from interview start to endIdx with a closing backtick and the end logic
        content = content.slice(0, interviewIdx) + `\n\n\`;` + content.slice(endIdx + 3); // +3 to skip the `\n\n`
        console.log("Successfully removed Interview advice section.");
    } else {
        console.error("Could not find closing target of systemPrompt!");
    }
} else {
    console.error("Could not find Interview header!");
}

// Convert back to CRLF
content = content.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Rules stripped from api/ai-assistant.js successfully.");
