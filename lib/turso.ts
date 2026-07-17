/**
 * lib/turso.ts
 * 
 * Manages database connection and handles schema migrations.
 */

// Import the existing db client so we reuse the connection
import db from '../api/db';
import { 
    CREATE_NOTIFICATIONS_TABLE, 
    CREATE_SESSIONS_TABLE, 
    CREATE_MANUAL_REFRESHES_TABLE,
    USER_COLUMNS, 
    STUDENT_COLUMNS 
} from '../database/schema';

export async function initDb() {
    try {
        console.log('[Turso] Initializing database schema and running migrations...');
        
        // 1. Create new tables
        await db.execute(CREATE_NOTIFICATIONS_TABLE);
        await db.execute(CREATE_SESSIONS_TABLE);
        await db.execute(CREATE_MANUAL_REFRESHES_TABLE);
        
        // 2. Add columns to users table
        const userColsInfo = await db.execute("PRAGMA table_info(users)");
        const existingUserCols = userColsInfo.rows.map((r: any) => String(r.name).toLowerCase());
        for (const col of USER_COLUMNS) {
            if (!existingUserCols.includes(col.name.toLowerCase())) {
                console.log(`[Turso] Altering users: adding column ${col.name} (${col.type})`);
                await db.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
            }
        }
        
        // 3. Add columns to students table
        const studentColsInfo = await db.execute("PRAGMA table_info(students)");
        const existingStudentCols = studentColsInfo.rows.map((r: any) => String(r.name).toLowerCase());
        for (const col of STUDENT_COLUMNS) {
            if (!existingStudentCols.includes(col.name.toLowerCase())) {
                console.log(`[Turso] Altering students: adding column ${col.name} (${col.type})`);
                await db.execute(`ALTER TABLE students ADD COLUMN ${col.name} ${col.type}`);
            }
        }
        
        // 4. Create unique index for telegram_id to enforce uniqueness in SQLite
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)");
        
        console.log('[Turso] Database schema and migrations completed successfully.');
    } catch (err: any) {
        console.error('[Turso] Database initialization error:', err.message);
        throw err;
    }
}

export { db };
export default db;
