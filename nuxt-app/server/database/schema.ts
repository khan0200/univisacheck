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

export const CREATE_MANUAL_REFRESHES_TABLE = `
CREATE TABLE IF NOT EXISTS bot_manual_refreshes (
    passport TEXT PRIMARY KEY,
    fullname TEXT,
    birthday TEXT,
    visa_type TEXT,
    application_no TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
`;

/**
 * Stores per-Telegram-user connections to a cabinet.
 * Replaces the single telegram_id column on users with a proper
 * one-to-many relationship: one cabinet → many Telegram subscribers.
 *
 * UNIQUE(telegram_id) ensures one Telegram account connects to
 * at most one cabinet at a time (INSERT OR REPLACE evicts the old row).
 */
export const CREATE_CABINET_SUBSCRIBERS_TABLE = `
CREATE TABLE IF NOT EXISTS cabinet_subscribers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    cabinet_id       INTEGER NOT NULL,
    telegram_id      INTEGER NOT NULL,
    telegram_username TEXT,
    first_name       TEXT,
    last_name        TEXT,
    session          TEXT,
    connected_at     TEXT DEFAULT (datetime('now')),
    UNIQUE(telegram_id)
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
