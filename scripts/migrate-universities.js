const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
const config = require('../turso.config.js');

const db = createClient({
    url: config.TURSO_DATABASE_URL,
    authToken: config.TURSO_AUTH_TOKEN
});

async function migrate() {
    console.log("Starting migration...");

    // Create tables
    await db.execute(`
        CREATE TABLE IF NOT EXISTS ai_universities (
            id TEXT PRIMARY KEY,
            name TEXT,
            korean_name TEXT,
            location TEXT,
            address TEXT,
            qs_rank TEXT,
            founded TEXT,
            tuition TEXT,
            app_fee TEXT,
            language TEXT,
            is_1_percent INTEGER,
            visa_status TEXT,
            kdb_amount TEXT,
            description TEXT,
            other_grants_note TEXT,
            uni_type TEXT,
            visa_details TEXT
        )
    `);

    // ALTER TABLE for tables created before uni_type/visa_details existed
    // (CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so columns
    // added to the schema above don't retroactively appear without this).
    const existingCols = (await db.execute("PRAGMA table_info(ai_universities)")).rows.map(r => r.name);
    if (!existingCols.includes('uni_type')) {
        await db.execute("ALTER TABLE ai_universities ADD COLUMN uni_type TEXT");
    }
    if (!existingCols.includes('visa_details')) {
        await db.execute("ALTER TABLE ai_universities ADD COLUMN visa_details TEXT");
    }

    await db.execute(`
        CREATE TABLE IF NOT EXISTS ai_majors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            university_id TEXT,
            name TEXT,
            track TEXT,
            FOREIGN KEY(university_id) REFERENCES ai_universities(id)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS ai_scholarships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            university_id TEXT,
            cert TEXT,
            percent TEXT,
            FOREIGN KEY(university_id) REFERENCES ai_universities(id)
        )
    `);

    // Clear existing data just in case
    await db.execute("PRAGMA foreign_keys = OFF");
    await db.execute("DELETE FROM ai_scholarships");
    await db.execute("DELETE FROM ai_majors");
    await db.execute("DELETE FROM ai_universities");
    await db.execute("PRAGMA foreign_keys = ON");

    const dataPath = path.join(__dirname, '..', 'universities-db.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    let count = 0;
    for (const [key, uni] of Object.entries(data)) {
        // Prepare data safely
        const id = key.trim().toUpperCase();
        
        await db.execute({
            sql: `INSERT INTO ai_universities
                (id, name, korean_name, location, address, qs_rank, founded, tuition, app_fee, language, is_1_percent, visa_status, kdb_amount, description, other_grants_note, uni_type, visa_details)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                uni.name || '',
                uni.koreanName || '',
                uni.location || '',
                uni.address || '',
                uni.qsRank || '',
                uni.founded || '',
                uni.tuition || '',
                uni.appFee || '',
                uni.language || '',
                uni.is1Percent ? 1 : 0,
                uni.visaStatus || '',
                uni.kdb1DayAfterAdmission || '',
                uni.description || '',
                uni.otherGrantsNote || '',
                uni.type || '',
                uni.visaDetails || ''
            ]
        });

        // Insert majors (english track)
        if (uni.englishTrackMajors && Array.isArray(uni.englishTrackMajors)) {
            for (const major of uni.englishTrackMajors) {
                await db.execute({
                    sql: `INSERT INTO ai_majors (university_id, name, track) VALUES (?, ?, 'english')`,
                    args: [id, major]
                });
            }
        }

        // Insert majors (korean track)
        if (uni.koreanTrackMajors && Array.isArray(uni.koreanTrackMajors)) {
            for (const major of uni.koreanTrackMajors) {
                await db.execute({
                    sql: `INSERT INTO ai_majors (university_id, name, track) VALUES (?, ?, 'korean')`,
                    args: [id, major]
                });
            }
        }

        // Insert majors (english track masters)
        if (uni.englishTrackMasters && Array.isArray(uni.englishTrackMasters)) {
            for (const major of uni.englishTrackMasters) {
                await db.execute({
                    sql: `INSERT INTO ai_majors (university_id, name, track) VALUES (?, ?, 'english_master')`,
                    args: [id, major]
                });
            }
        }

        // Insert majors (korean track masters)
        if (uni.koreanTrackMasters && Array.isArray(uni.koreanTrackMasters)) {
            for (const major of uni.koreanTrackMasters) {
                await db.execute({
                    sql: `INSERT INTO ai_majors (university_id, name, track) VALUES (?, ?, 'korean_master')`,
                    args: [id, major]
                });
            }
        }

        // Insert scholarships
        if (uni.scholarships && Array.isArray(uni.scholarships)) {
            for (const sch of uni.scholarships) {
                await db.execute({
                    sql: `INSERT INTO ai_scholarships (university_id, cert, percent) VALUES (?, ?, ?)`,
                    args: [id, sch.cert || '', sch.percent || '']
                });
            }
        }

        count++;
    }

    console.log(`Successfully migrated ${count} universities.`);
    process.exit(0);
}

migrate().catch(console.error);
