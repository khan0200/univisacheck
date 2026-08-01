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

    // Words too generic to safely treat as a university-name signal on their
    // own -- "Seoul"/"Korea" show up constantly in ordinary conversation
    // ("Koreyada o'qish", talk of Seoul the city) with no university meant.
    static GENERIC_NAME_WORDS = new Set(['university', 'seoul', 'korea', 'busan', 'far', 'national']);

    // Cheap in-process match against all known university names -- lets
    // callers detect a mentioned university from raw text without an LLM
    // entity-extraction call (used by the Visa Calculator flow, which skips
    // IntentAnalyzer entirely). Matches on the distinguishing keyword of each
    // name (e.g. "Sejong", "Gachon") as a whole word, rather than the full
    // "X University" string, since students write it with Uzbek suffixes
    // attached ("Sejong universitetiga", "Gachonga") instead of the English
    // form. Skips names whose only distinguishing word is too generic to
    // match safely (e.g. "Seoul National University").
    async matchUniversityNamesInText(text) {
        if (!text) return [];
        const cacheKey = 'all_uni_names';
        let names = cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < CACHE_TTL)
            ? cache.get(cacheKey).data
            : null;

        if (!names) {
            const res = await db.execute(`SELECT name, korean_name FROM ai_universities`);
            names = res.rows.filter(r => r.name).map(r => {
                const distinctiveWord = r.name.split(' ').find(w => !UniversityService.GENERIC_NAME_WORDS.has(w.toLowerCase()) && w.length >= 3);
                return { name: r.name, keyword: distinctiveWord || null };
            }).filter(r => r.keyword);
            cache.set(cacheKey, { data: names, timestamp: Date.now() });
        }

        const matched = names.filter(({ keyword }) => new RegExp(`\\b${keyword}`, 'i').test(text));
        // Longest keyword first so a more specific match isn't shadowed by a shorter one.
        return [...new Set(matched.sort((a, b) => b.keyword.length - a.keyword.length).map(m => m.name))].slice(0, 3);
    }
}

module.exports = new UniversityService();
