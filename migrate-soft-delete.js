/**
 * One-time migration: adds a `deletedAt` column to the students table so
 * Delete becomes a soft-delete (data kept, hidden from the dashboard, but
 * still available for passport autofill if the same student is re-added).
 * Safe to re-run — skips if the column already exists.
 * Usage:
 *   node migrate-soft-delete.js
 */

const path = require('path');
const { createClient } = require('@libsql/client');

let localConfig = {};
try {
    localConfig = require(path.join(__dirname, 'turso.config.js'));
} catch (_) {
    // Not present — expected in production, where env vars are used instead.
}

const dbUrl = process.env.TURSO_URL || localConfig.TURSO_DATABASE_URL;
const dbAuthToken = process.env.TURSO_AUTH_TOKEN || localConfig.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbAuthToken) {
    console.error('❌ Missing Turso credentials. Set TURSO_URL and TURSO_AUTH_TOKEN env vars, or add turso.config.js locally.');
    process.exit(1);
}

async function main() {
    const client = createClient({ url: dbUrl, authToken: dbAuthToken });

    try {
        const columns = await client.execute({ sql: `PRAGMA table_info(students)`, args: [] });
        const hasColumn = columns.rows.some(r => r.name === 'deletedAt');

        if (hasColumn) {
            console.log('✅ students.deletedAt already exists — nothing to do.');
            return;
        }

        await client.execute({ sql: `ALTER TABLE students ADD COLUMN deletedAt TEXT`, args: [] });
        console.log('✨ Migration complete: students.deletedAt added.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        client.close();
    }
}

main();
