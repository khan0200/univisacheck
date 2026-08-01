const db = require('../lib/db');

// Adds a students_count column to users and fills it with the number of
// students each account currently has in their cabinet.
//
// "Currently has" means active rows only: students soft-deleted from a
// cabinet (deletedAt set) are excluded, so the number matches what the
// agency actually sees on their dashboard.
//
// Safe to re-run — the column is only added if missing, and the counts are
// always recomputed from the students table, so this doubles as a way to
// resync the column if it ever drifts.
async function migrate() {
    console.log('Adding students_count to users...');

    // SQLite has no "ADD COLUMN IF NOT EXISTS"; check the table info instead.
    const info = await db.execute('PRAGMA table_info(users)');
    const hasColumn = info.rows.some(r => r.name === 'students_count');

    if (hasColumn) {
        console.log('students_count column already exists — recomputing counts.');
    } else {
        await db.execute('ALTER TABLE users ADD COLUMN students_count INTEGER DEFAULT 0');
        console.log('students_count column added.');
    }

    // Backfill every user in one statement: users with no students (or only
    // soft-deleted ones) get 0 rather than NULL, so the column is always a
    // number the UI can display directly.
    await db.execute(`
        UPDATE users SET students_count = (
            SELECT COUNT(*) FROM students
            WHERE students.userId = users.id AND students.deletedAt IS NULL
        )
    `);

    const result = await db.execute(
        'SELECT id, username, students_count FROM users ORDER BY students_count DESC, id ASC'
    );
    console.log(`\nBackfilled ${result.rows.length} users:`);
    for (const row of result.rows) {
        console.log(`  ${String(row.id).padStart(8)}  ${row.students_count}  ${row.username || ''}`);
    }
}

migrate()
    .then(() => console.log('\nDone.'))
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
