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
  CREATE_VISA_SESSIONS_TABLE,
  CREATE_VISA_PROCESSING_NOTIFICATIONS_TABLE,
  CREATE_VPN_DATE_INDEX,
  CREATE_TELEGRAM_NOTIFICATION_MESSAGES_TABLE,
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
    await db.execute(CREATE_TASKS_STATUS_INDEX)
    await db.execute(CREATE_TASKS_PASSPORT_INDEX)
    await db.execute(CREATE_TASKS_JOBID_INDEX)
    await db.execute(CREATE_VISA_SESSIONS_TABLE)
    await db.execute(CREATE_VISA_PROCESSING_NOTIFICATIONS_TABLE)
    await db.execute(CREATE_VPN_DATE_INDEX)
    await db.execute(CREATE_TELEGRAM_NOTIFICATION_MESSAGES_TABLE)

    // 2. Add columns to users table
    const userColsInfo = await db.execute('PRAGMA table_info(users)')
    const existingUserCols = userColsInfo.rows.map((r: Record<string, unknown>) => String(r.name).toLowerCase())
    for (const col of USER_COLUMNS) {
      if (!existingUserCols.includes(col.name.toLowerCase())) {
        console.log(`[Turso] Altering users: adding column ${col.name} (${col.type})`)
        await db.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    // 3. Add columns to students table
    const studentColsInfo = await db.execute('PRAGMA table_info(students)')
    const existingStudentCols = studentColsInfo.rows.map((r: Record<string, unknown>) => String(r.name).toLowerCase())
    for (const col of STUDENT_COLUMNS) {
      if (!existingStudentCols.includes(col.name.toLowerCase())) {
        console.log(`[Turso] Altering students: adding column ${col.name} (${col.type})`)
        await db.execute(`ALTER TABLE students ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    // 4. Create cabinet_subscribers table (multi-subscriber support)
    await db.execute(CREATE_CABINET_SUBSCRIBERS_TABLE)

    // 5. Add lang column to cabinet_subscribers (language preference per subscriber)
    const csColsInfo = await db.execute('PRAGMA table_info(cabinet_subscribers)')
    const existingCsCols = csColsInfo.rows.map((r: Record<string, unknown>) => String(r.name).toLowerCase())
    if (!existingCsCols.includes('lang')) {
      console.log('[Turso] Altering cabinet_subscribers: adding column lang TEXT DEFAULT \'uz\'')
      await db.execute('ALTER TABLE cabinet_subscribers ADD COLUMN lang TEXT DEFAULT \'uz\'')
    }

    // 6. Create unique index for telegram_id to enforce uniqueness in SQLite
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)')

    console.log('[Turso] Database schema and migrations completed successfully.')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Turso] Database initialization error:', msg)
    throw err
  }
}

export { db }
export default db
