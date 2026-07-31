const db = require('./lib/db');

async function test() {
    const intent = 'visa_calc';
    const message = "viza uchun suhbat bo'ladimi?";
    
    const words = message.split(/[^\wа-яёўқғҳa-z0-9%']+/i)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 3);

    let scoreExpressions = [];
    let queryParams = [];

    if (intent && intent !== 'other') {
        scoreExpressions.push(`(CASE WHEN LOWER(category) = ? THEN 3 ELSE 0 END)`);
        queryParams.push(intent.toLowerCase());
    } else {
        scoreExpressions.push(`0`);
    }

    for (const word of words) {
        const pattern = `%${word}%`;
        scoreExpressions.push(`(CASE WHEN LOWER(question) LIKE ? THEN 10 ELSE 0 END)`);
        scoreExpressions.push(`(CASE WHEN LOWER(aliases) LIKE ? THEN 5 ELSE 0 END)`);
        scoreExpressions.push(`(CASE WHEN LOWER(keywords) LIKE ? THEN 3 ELSE 0 END)`);
        queryParams.push(pattern, pattern, pattern);
    }

    const scoreSql = scoreExpressions.join(' + ');
    const sql = `
        SELECT * FROM (
            SELECT id, question, category, (${scoreSql}) as score 
            FROM ai_knowledge 
            WHERE is_active = 1
        )
        WHERE score > 0
        ORDER BY score DESC, id DESC
        LIMIT 3
    `;

    try {
        const res = await db.execute({ sql, args: queryParams });
        console.log("Scored results:", res.rows);
    } catch (e) {
        console.error(e);
    }
}

test();
