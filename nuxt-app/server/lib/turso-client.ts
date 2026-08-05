import { getTursoClient } from '../utils/turso'
import type { InArgs, InStatement } from '@libsql/client'

/**
 * Drop-in replacement for the legacy `lib/turso.ts`'s default `db` export
 * (itself re-exporting `api/_lib/db`) — every ported bot/auth/cabinet file
 * calls `db.execute(...)` and already awaits it, so this lazy wrapper
 * around the existing getTursoClient() singleton is a safe substitute
 * without touching 30+ call sites across those files.
 */
const db = {
  execute: async (stmt: InStatement) => (await getTursoClient()).execute(stmt),
  batch: async (stmts: InStatement[]) => (await getTursoClient()).batch(stmts)
}

export default db
