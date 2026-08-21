/**
 * server/lib/turso.ts
 *
 * Manages database connection and handles schema migrations. Ported from
 * the legacy lib/turso.ts — db import redirected to turso-client.ts (which
 * wraps the shared server/utils/turso.ts singleton) since the legacy
 * api/_lib/db it originally imported doesn't exist inside nuxt-app.
 */

import db from './turso-client'
import {
  CREATE_NOTIFICATIONS_TABLE,
  CREATE_SESSIONS_TABLE,
  CREATE_MANUAL_REFRESHES_TABLE,
  CREATE_CABINET_SUBSCRIBERS_TABLE,
  CREATE_JOBS_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_TASKS_STATUS_INDEX,
  CREATE_TASKS_PASSPORT_INDEX,
  CREATE_TASKS_JOBID_INDEX,
  CREATE_STUDENTS_USER_PASSPORT_INDEX,
  CREATE_STUDENTS_PASSPORT_INDEX,
  CREATE_VISA_SESSIONS_TABLE,
  CREATE_SCHEDULER_LOCK_TABLE,
  CREATE_VISA_PROCESSING_NOTIFICATIONS_TABLE,
  CREATE_VPN_DATE_INDEX,
  CREATE_TELEGRAM_NOTIFICATION_MESSAGES_TABLE,
  CREATE_SETTINGS_UNIVERSITIES_TABLE,
  CREATE_SETTINGS_TARIFFS_TABLE,
  CREATE_SETTINGS_COORDINATORS_TABLE,
  CREATE_SETTINGS_B2B_TABLE,
  CREATE_ADMISSIONS_TABLE,
  CREATE_ADMISSIONS_UNIVERSITY_INDEX,
  CREATE_ADMISSIONS_CREATED_AT_INDEX,
  USER_COLUMNS,
  STUDENT_COLUMNS
} from '../database/schema'

export async function initDb() {
  try {
    console.log('[Turso] Initializing database schema and running migrations...')

    // 1. Create new tables
    await db.execute(CREATE_NOTIFICATIONS_TABLE)
    await db.execute(CREATE_SESSIONS_TABLE)
    await db.execute(CREATE_MANUAL_REFRESHES_TABLE)
    await db.execute(CREATE_JOBS_TABLE)
    await db.execute(CREATE_TASKS_TABLE)
    await db.execute(CREATE_SCHEDULER_LOCK_TABLE)
    await db.execute(CREATE_TASKS_STATUS_INDEX)
    await db.execute(CREATE_TASKS_PASSPORT_INDEX)
    await db.execute(CREATE_TASKS_JOBID_INDEX)
    await db.execute(CREATE_STUDENTS_USER_PASSPORT_INDEX)
    await db.execute(CREATE_STUDENTS_PASSPORT_INDEX)
    await db.execute(CREATE_VISA_SESSIONS_TABLE)

    await db.execute(CREATE_VISA_PROCESSING_NOTIFICATIONS_TABLE)
    await db.execute(CREATE_VPN_DATE_INDEX)
    await db.execute(CREATE_TELEGRAM_NOTIFICATION_MESSAGES_TABLE)

    // Settings isolated datasets
    await db.execute(CREATE_SETTINGS_UNIVERSITIES_TABLE)
    await db.execute(CREATE_SETTINGS_TARIFFS_TABLE)
    await db.execute(CREATE_SETTINGS_COORDINATORS_TABLE)
    await db.execute(CREATE_SETTINGS_B2B_TABLE)

    // Admissions dataset (migrated from Supabase)
    await db.execute(CREATE_ADMISSIONS_TABLE)
    await db.execute(CREATE_ADMISSIONS_UNIVERSITY_INDEX)
    await db.execute(CREATE_ADMISSIONS_CREATED_AT_INDEX)

    // Helper to safely add column if not exists
    const ensureColumn = async (table: string, colName: string, colType: string) => {
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colName} ${colType}`)
      } catch {
        // Fallback for SQLite or systems where ADD COLUMN IF NOT EXISTS differs
        try {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colType}`)
        } catch {
          // Column already exists or error ignored
        }
      }
    }

    // 2. Add columns to users table
    for (const col of USER_COLUMNS) {
      await ensureColumn('users', col.name, col.type)
    }

    // 3. Add columns to students table
    for (const col of STUDENT_COLUMNS) {
      await ensureColumn('students', col.name, col.type)
    }

    // 4. Create cabinet_subscribers table (multi-subscriber support)
    await db.execute(CREATE_CABINET_SUBSCRIBERS_TABLE)

    // 5. Add lang column to cabinet_subscribers
    await ensureColumn('cabinet_subscribers', 'lang', 'TEXT DEFAULT \'uz\'')

    // Add check_source column to visa_check_jobs if missing
    await ensureColumn('visa_check_jobs', 'check_source', 'TEXT DEFAULT \'manual\'')

    // Add lastNotifiedStatus columns if missing (persistent notification dedup)
    await ensureColumn('students', '"lastNotifiedStatus"', 'TEXT DEFAULT NULL')
    await ensureColumn('students', 'last_notified_status', 'TEXT DEFAULT NULL')

    // Add refundApplication columns if missing
    await ensureColumn('students', '"refundApplication"', 'INTEGER DEFAULT 0')
    await ensureColumn('students', 'refund_application', 'INTEGER DEFAULT 0')

    // 6. Create unique index for telegram_id
    try {
      await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)')
    } catch {
      // Ignore if index already exists
    }

    // 7. Deduplicate settings_universities
    try {
      await db.execute('DELETE FROM settings_universities WHERE id NOT IN (SELECT min(id) FROM settings_universities GROUP BY name)')
    } catch {
      // Ignore deduplication error
    }

    console.log('[DB] Database schema and migrations completed successfully.')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Turso] Database initialization error:', msg)
    throw err
  }
}

export { db }
export default db
