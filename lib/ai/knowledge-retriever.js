const db = require('../db');

class KnowledgeRetriever {
    async retrieve(intent, keywords = [], originalMessage = "") {
        // Construct search logic. Since we don't have FTS5 configured directly on the table, 
        // we'll do a simple LIKE search across category, topic, keywords, and question.
        
        let queryParams = [];
        let conditions = [];

        if (intent && intent !== 'other') {
            conditions.push(`LOWER(category) LIKE ?`);
            queryParams.push(`%${intent.toLowerCase()}%`);
        }

        // Add word-based searching
        const words = originalMessage.split(' ').filter(w => w.length > 3).slice(0, 3); // top 3 words
        for (const word of words) {
            conditions.push(`(LOWER(question) LIKE ? OR LOWER(keywords) LIKE ? OR LOWER(aliases) LIKE ?)`);
            const term = `%${word.toLowerCase()}%`;
            queryParams.push(term, term, term);
        }

        if (conditions.length === 0) return []; // Nothing specific to search

        const sql = `SELECT * FROM ai_knowledge WHERE is_active = 1 AND (${conditions.join(' OR ')}) LIMIT 3`;

        try {
            const res = await db.execute({ sql, args: queryParams });
            return res.rows.map(r => ({
                question: r.question,
                answer: r.answer,
                category: r.category
            }));
        } catch (error) {
            console.error("KnowledgeRetriever Error:", error);
            return [];
        }
    }
}

module.exports = new KnowledgeRetriever();
