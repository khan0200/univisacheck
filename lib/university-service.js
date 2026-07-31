const db = require('./db');

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

class UniversityService {
    async getUniversityByName(name) {
        if (!name) return null;
        let searchName = name.trim();
        const lower = searchName.toLowerCase();
        if (lower === 'bufs') searchName = 'Busan University of Foreign Studies';
        else if (lower === 'hufs') searchName = 'Hankuk University of Foreign Studies';
        else if (lower === 'skku') searchName = 'Sungkyunkwan University';
        else if (lower === 'snu') searchName = 'Seoul National University';
        else if (lower === 'kaist') searchName = 'KAIST';

        const cacheKey = `uni_${searchName.toLowerCase()}`;
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                return cached.data;
            }
        }

        const res = await db.execute({
            sql: `SELECT * FROM ai_universities WHERE LOWER(name) LIKE ? OR LOWER(korean_name) LIKE ? LIMIT 1`,
            args: [`%${searchName.toLowerCase()}%`, `%${searchName.toLowerCase()}%`]
        });

        if (res.rows.length === 0) return null;
        
        const uni = res.rows[0];
        
        // Fetch majors and scholarships
        const majorsRes = await db.execute({
            sql: `SELECT * FROM ai_majors WHERE university_id = ?`,
            args: [uni.id]
        });
        
        const schRes = await db.execute({
            sql: `SELECT * FROM ai_scholarships WHERE university_id = ?`,
            args: [uni.id]
        });

        const fullUni = {
            ...uni,
            is1Percent: uni.is_1_percent === 1,
            majors: majorsRes.rows.map(r => ({ name: r.name, track: r.track })),
            scholarships: schRes.rows.map(r => ({ cert: r.cert, percent: r.percent }))
        };

        cache.set(cacheKey, { data: fullUni, timestamp: Date.now() });
        return fullUni;
    }

    async getUniversitiesForComparison(names) {
        const results = [];
        for (const name of names) {
            const uni = await this.getUniversityByName(name);
            if (uni) results.push(uni);
        }
        return results;
    }

    async get1PercentUniversities() {
        const res = await db.execute(`SELECT name, korean_name, qs_rank FROM ai_universities WHERE is_1_percent = 1`);
        return res.rows;
    }
}

module.exports = new UniversityService();
