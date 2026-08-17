/**
 * database/schema.ts
 *
 * Defines PostgreSQL schemas for tables and columns.
 */

export const CREATE_NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT,
    student_id TEXT,
    old_status TEXT,
    new_status TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS bot_sessions (
    telegram_id BIGINT PRIMARY KEY,
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
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_CABINET_SUBSCRIBERS_TABLE = `
CREATE TABLE IF NOT EXISTS cabinet_subscribers (
    id               SERIAL PRIMARY KEY,
    cabinet_id       INTEGER NOT NULL,
    telegram_id      BIGINT NOT NULL UNIQUE,
    telegram_username TEXT,
    first_name       TEXT,
    last_name        TEXT,
    session          TEXT,
    connected_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    lang             TEXT DEFAULT 'uz'
);
`

export interface DbColumn {
  name: string
  type: string
}

export const USER_COLUMNS: DbColumn[] = [
  { name: 'telegram_id', type: 'BIGINT' },
  { name: 'telegram_username', type: 'TEXT' },
  { name: 'first_name', type: 'TEXT' },
  { name: 'last_name', type: 'TEXT' },
  { name: 'encrypted_password', type: 'TEXT' },
  { name: 'session', type: 'TEXT' },
  { name: 'cookies', type: 'TEXT' },
  { name: 'updated_at', type: 'TIMESTAMPTZ' }
]

export const STUDENT_COLUMNS: DbColumn[] = [
  { name: 'telegram_user_id', type: 'BIGINT' },
  { name: 'student_id', type: 'TEXT' },
  { name: 'application_no', type: 'TEXT' },
  { name: 'fullname', type: 'TEXT' },
  { name: 'visa_type', type: 'TEXT' },
  { name: 'application_date', type: 'TEXT' },
  { name: 'last_checked', type: 'TEXT' },
  { name: 'tariff', type: 'TEXT' },
  { name: 'university', type: 'TEXT' },
  { name: 'coordinator', type: 'TEXT' },
  { name: 'b2b', type: 'TEXT' },
  { name: 'check_source', type: 'TEXT' },
  { name: 'checkSource', type: 'TEXT' }
]

export const CREATE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_check_jobs (
    id TEXT PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    check_source TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_check_tasks (
    id TEXT PRIMARY KEY,
    "jobId" TEXT NOT NULL REFERENCES visa_check_jobs(id) ON DELETE CASCADE,
    "userId" INTEGER NOT NULL,
    passport TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    "lockedAt" TIMESTAMPTZ,
    "lockedBy" TEXT,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    error TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_TASKS_STATUS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_visa_tasks_status ON visa_check_tasks(status);
`

export const CREATE_TASKS_PASSPORT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_visa_tasks_passport ON visa_check_tasks(passport);
`

export const CREATE_TASKS_JOBID_INDEX = `
CREATE INDEX IF NOT EXISTS idx_visa_tasks_jobId ON visa_check_tasks("jobId");
`

export const CREATE_VISA_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_sessions (
    key TEXT PRIMARY KEY,
    cookies TEXT,
    "fetchedAt" BIGINT
);
`

export const CREATE_SCHEDULER_LOCK_TABLE = `
CREATE TABLE IF NOT EXISTS visa_scheduler_lock (
    id TEXT PRIMARY KEY,
    locked_at BIGINT NOT NULL,
    locked_by TEXT NOT NULL
);
`

export const CREATE_VISA_PROCESSING_NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS visa_processing_notifications (
    id                    SERIAL PRIMARY KEY,
    type                  TEXT NOT NULL DEFAULT 'visa_processing_started',
    application_date      TEXT NOT NULL,
    visa_types            TEXT NOT NULL DEFAULT '[]',
    message               TEXT NOT NULL DEFAULT '',
    triggered_by_user_id  INTEGER,
    triggered_by_passport TEXT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, application_date)
);
`

export const CREATE_VPN_DATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_vpn_app_date
    ON visa_processing_notifications(application_date);
`

export const CREATE_TELEGRAM_NOTIFICATION_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS telegram_notification_messages (
    id              SERIAL PRIMARY KEY,
    notification_id INTEGER NOT NULL,
    telegram_id     BIGINT NOT NULL,
    message_id      BIGINT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(notification_id, telegram_id)
);
`

// ── Settings: isolated CRUD datasets ────────────────────────────────────────

export const CREATE_SETTINGS_UNIVERSITIES_TABLE = `
CREATE TABLE IF NOT EXISTS settings_universities (
    id         SERIAL PRIMARY KEY,
    "userId"   INTEGER NOT NULL,
    name       TEXT NOT NULL,
    location   TEXT DEFAULT '',
    notes      TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_SETTINGS_TARIFFS_TABLE = `
CREATE TABLE IF NOT EXISTS settings_tariffs (
    id          SERIAL PRIMARY KEY,
    "userId"    INTEGER NOT NULL,
    name        TEXT NOT NULL,
    price       TEXT DEFAULT '',
    currency    TEXT DEFAULT 'USD',
    description TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_SETTINGS_COORDINATORS_TABLE = `
CREATE TABLE IF NOT EXISTS settings_coordinators (
    id        SERIAL PRIMARY KEY,
    "userId"  INTEGER NOT NULL,
    name      TEXT NOT NULL,
    contact   TEXT DEFAULT '',
    email     TEXT DEFAULT '',
    notes     TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_SETTINGS_B2B_TABLE = `
CREATE TABLE IF NOT EXISTS settings_b2b (
    id        SERIAL PRIMARY KEY,
    "userId"  INTEGER NOT NULL,
    name      TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

// ── University Admissions ───────────────────────────────────────────────────

export const CREATE_ADMISSIONS_TABLE = `
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
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

export const CREATE_ADMISSIONS_UNIVERSITY_INDEX = `
CREATE INDEX IF NOT EXISTS idx_admissions_university ON admissions(university_name);
`

export const CREATE_ADMISSIONS_CREATED_AT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_admissions_created_at ON admissions(created_at);
`
