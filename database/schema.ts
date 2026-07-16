/**
 * database/schema.ts
 * 
 * Defines schemas for new tables and column additions for the Telegram bot.
 */

export const CREATE_NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER,
    student_id TEXT,
    old_status TEXT,
    new_status TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
`;

export const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS bot_sessions (
    telegram_id INTEGER PRIMARY KEY,
    state TEXT,
    data TEXT
);
`;

export interface DbColumn {
    name: string;
    type: string;
}

export const USER_COLUMNS: DbColumn[] = [
    { name: 'telegram_id', type: 'INTEGER' },
    { name: 'telegram_username', type: 'TEXT' },
    { name: 'first_name', type: 'TEXT' },
    { name: 'last_name', type: 'TEXT' },
    { name: 'encrypted_password', type: 'TEXT' },
    { name: 'session', type: 'TEXT' },
    { name: 'cookies', type: 'TEXT' },
    { name: 'updated_at', type: 'TEXT' }
];

export const STUDENT_COLUMNS: DbColumn[] = [
    { name: 'telegram_user_id', type: 'INTEGER' },
    { name: 'student_id', type: 'TEXT' },
    { name: 'application_no', type: 'TEXT' },
    { name: 'fullname', type: 'TEXT' },
    { name: 'visa_type', type: 'TEXT' },
    { name: 'application_date', type: 'TEXT' },
    { name: 'last_checked', type: 'TEXT' }
];
