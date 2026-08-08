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
`

export const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS bot_sessions (
    telegram_id INTEGER PRIMARY KEY,
    state TEXT,
    data TEXT
);
`

export const CREATE_MANUAL_REFRESHES_TABLE = `
CREATE TABLE IF NOT EXISTS bot_manual_refreshes (
    passport TEXT PRIMARY KEY,
    fullname TEXT,
    birthday TEXT,
    visa_type TEXT,
    application_no TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
`

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
`

export interface DbColumn {
  name: string
  type: string
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
]

export const STUDENT_COLUMNS: DbColumn[] = [
  { name: 'telegram_user_id', type: 'INTEGER' },
  { name: 'student_id', type: 'TEXT' },
  { name: 'application_no', type: 'TEXT' },
  { name: 'fullname', type: 'TEXT' },
  { name: 'visa_type', type: 'TEXT' },
  { name: 'application_date', type: 'TEXT' },
  { name: 'last_checked', type: 'TEXT' }
]

export const CREATE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_check_jobs (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);
`

export const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_check_tasks (
    id TEXT PRIMARY KEY,
    jobId TEXT NOT NULL,
    userId INTEGER NOT NULL,
    passport TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    lockedAt TEXT,
    lockedBy TEXT,
    startedAt TEXT,
    completedAt TEXT,
    error TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(jobId) REFERENCES visa_check_jobs(id) ON DELETE CASCADE
);
`

export const CREATE_TASKS_STATUS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_visa_tasks_status ON visa_check_tasks(status);
`

export const CREATE_TASKS_PASSPORT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_visa_tasks_passport ON visa_check_tasks(passport);
`

export const CREATE_TASKS_JOBID_INDEX = `
CREATE INDEX IF NOT EXISTS idx_visa_tasks_jobId ON visa_check_tasks(jobId);
`

export const CREATE_VISA_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_sessions (
    key TEXT PRIMARY KEY,
    cookies TEXT,
    fetchedAt INTEGER
);
`

export const CREATE_VISA_PROCESSING_NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_processing_notifications (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    type                  TEXT NOT NULL DEFAULT 'visa_processing_started',
    application_date      TEXT NOT NULL,
    visa_types            TEXT NOT NULL DEFAULT '[]',
    message               TEXT NOT NULL DEFAULT '',
    triggered_by_user_id  INTEGER,
    triggered_by_passport TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now')),
    UNIQUE(type, application_date)
);
`

export const CREATE_VPN_DATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_vpn_app_date
    ON visa_processing_notifications(application_date);
`

export const CREATE_TELEGRAM_NOTIFICATION_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS telegram_notification_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id INTEGER NOT NULL,
    telegram_id     INTEGER NOT NULL,
    message_id      INTEGER NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(notification_id, telegram_id)
);
`
