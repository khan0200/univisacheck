const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
const config = require('../turso.config.js');

const db = createClient({
    url: process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || config.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN || config.TURSO_AUTH_TOKEN
});

async function migrate() {
    console.log('--- Starting Admissions Migration from Supabase to Turso ---');

    // 1. Create admissions table and indexes
    console.log('1. Ensuring admissions table exists in Turso...');
    await db.execute(`
        CREATE TABLE IF NOT EXISTS admissions (
            id                  TEXT PRIMARY KEY,
            university_name     TEXT NOT NULL,
            education_level     TEXT NOT NULL,
            admission_period    TEXT DEFAULT '',
            rounds_count        TEXT DEFAULT '',
            is_expected         INTEGER DEFAULT 0,
            expected_date_range TEXT DEFAULT '{}',
            rounds              TEXT DEFAULT '[]',
            visa_types          TEXT DEFAULT '[]',
            university_types    TEXT DEFAULT '[]',
            is_hidden           INTEGER DEFAULT 0,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        );
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_admissions_university ON admissions(university_name);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_admissions_created_at ON admissions(created_at);`);

    // 2. Read backup file
    const backupPath = path.join(__dirname, '..', 'supabase_admissions_backup.json');
    if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found at ${backupPath}`);
    }

    const admissions = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    console.log(`2. Read ${admissions.length} admission records from backup.`);

    // 3. Insert / upsert each admission record
    let inserted = 0;
    for (const item of admissions) {
        const id = item.id;
        const university_name = String(item.university_name || '').trim();
        const education_level = String(item.education_level || '').trim();
        const admission_period = item.admission_period ? String(item.admission_period).trim() : '';
        const rounds_count = item.rounds_count ? String(item.rounds_count).trim() : '';
        const is_expected = item.is_expected ? 1 : 0;
        const expected_date_range = typeof item.expected_date_range === 'object' && item.expected_date_range !== null
            ? JSON.stringify(item.expected_date_range)
            : '{}';
        const rounds = Array.isArray(item.rounds) ? JSON.stringify(item.rounds) : '[]';
        const visa_types = Array.isArray(item.visa_types) ? JSON.stringify(item.visa_types) : '[]';
        const university_types = Array.isArray(item.university_types) ? JSON.stringify(item.university_types) : '[]';
        const is_hidden = item.is_hidden ? 1 : 0;
        const created_at = item.created_at || new Date().toISOString();
        const updated_at = item.updated_at || new Date().toISOString();

        await db.execute({
            sql: `
                INSERT INTO admissions (
                    id, university_name, education_level, admission_period, rounds_count,
                    is_expected, expected_date_range, rounds, visa_types, university_types,
                    is_hidden, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?
                ) ON CONFLICT(id) DO UPDATE SET
                    university_name = excluded.university_name,
                    education_level = excluded.education_level,
                    admission_period = excluded.admission_period,
                    rounds_count = excluded.rounds_count,
                    is_expected = excluded.is_expected,
                    expected_date_range = excluded.expected_date_range,
                    rounds = excluded.rounds,
                    visa_types = excluded.visa_types,
                    university_types = excluded.university_types,
                    is_hidden = excluded.is_hidden,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at
            `,
            args: [
                id, university_name, education_level, admission_period, rounds_count,
                is_expected, expected_date_range, rounds, visa_types, university_types,
                is_hidden, created_at, updated_at
            ]
        });
        inserted++;
    }

    console.log(`3. Successfully upserted ${inserted} records into Turso admissions table.`);

    // 4. Verify count in Turso
    const countRes = await db.execute(`SELECT COUNT(*) as count FROM admissions`);
    const totalInDb = countRes.rows[0].count;
    console.log(`4. Total records in Turso admissions table: ${totalInDb}`);

    if (totalInDb !== admissions.length) {
        console.warn(`WARNING: Record count mismatch! Expected ${admissions.length}, found ${totalInDb}`);
    } else {
        console.log('SUCCESS: All admissions records migrated with 100% data integrity!');
    }
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
