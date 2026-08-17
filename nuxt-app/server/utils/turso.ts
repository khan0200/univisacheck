import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient, type Client as LibSqlClient, type InArgs, type InStatement } from '@libsql/client'
import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null
let libSqlClient: LibSqlClient | null = null
let useLibSqlFallback = false

async function loadLocalConfig(): Promise<{ DATABASE_URL?: string, TURSO_DATABASE_URL?: string, TURSO_AUTH_TOKEN?: string }> {
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (!existsSync(configPath)) return {}
    const mod = await import(pathToFileURL(configPath).href)
    return mod.default || mod
  } catch {
    return {}
  }
}

const CAMEL_IDENTIFIERS = [
  'userId', 'fullName', 'studentId', 'applicationDate', 'lastChecked',
  'rejectReason', 'pdfUrl', 'apiResponse', 'batchSelected',
  'batchSelectedUpdatedAt', 'createdAt', 'visaType', 'applicationNo',
  'deletedAt', 'checkSource', 'updatedAt', 'jobId', 'lockedAt',
  'lockedBy', 'startedAt', 'completedAt', 'fetchedAt'
]
const CAMEL_REGEX = new RegExp(`(?<!["'a-zA-Z0-9_])(${CAMEL_IDENTIFIERS.join('|')})(?!["'a-zA-Z0-9_])`, 'g')

export function transformSql(sql: string): string {
  let paramIndex = 1
  let inSingleQuote = false
  let inDoubleQuote = false
  let result = ''

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    if (char === '\'' && (i === 0 || sql[i - 1] !== '\\')) {
      inSingleQuote = !inSingleQuote
      result += char
    } else if (char === '"' && (i === 0 || sql[i - 1] !== '\\')) {
      inDoubleQuote = !inDoubleQuote
      result += char
    } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      result += `$${paramIndex++}`
    } else {
      result += char
    }
  }

  if (result.includes('INSERT OR IGNORE INTO')) {
    result = result.replace('INSERT OR IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING'
  }

  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(result)) {
    result = result.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i, (_match, table, cols, vals) => {
      const colList = cols.split(',').map((c: string) => c.trim())
      const lowerTable = table.toLowerCase()
      let pKey = 'id'
      if (lowerTable === 'visa_sessions') {
        pKey = 'key'
      } else if (lowerTable === 'students') {
        pKey = '"userId", passport'
      } else if (lowerTable === 'bot_sessions') {
        pKey = 'telegram_id'
      } else if (lowerTable === 'cabinet_subscribers') {
        pKey = 'telegram_id'
      } else if (lowerTable === 'bot_manual_refreshes') {
        pKey = 'passport'
      } else if (lowerTable === 'telegram_notification_messages') {
        pKey = 'notification_id, telegram_id'
      } else if (lowerTable === 'visa_processing_notifications') {
        pKey = 'type, application_date'
      } else if (lowerTable === 'visa_scheduler_lock') {
        pKey = 'id'
      }
      const updateSet = colList.map((c: string) => `${c} = EXCLUDED.${c}`).join(', ')
      return `INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT (${pKey}) DO UPDATE SET ${updateSet}`
    })
  }

  result = result.replace(/datetime\(['"]now['"]\s*,\s*['"]\+([^'"]+)['"]\)/gi, "(CURRENT_TIMESTAMP + INTERVAL '$1')")
  result = result.replace(/datetime\(['"]now['"]\s*,\s*['"]\-([^'"]+)['"]\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '$1')")
  result = result.replace(/datetime\(['"]now['"]\)/gi, 'CURRENT_TIMESTAMP')

  // Auto-quote camelCase column names for PostgreSQL
  result = result.replace(CAMEL_REGEX, '"$1"')

  return result
}

export interface SqlStatement {
  sql: string
  args?: unknown[] | Record<string, unknown>
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[]
  columns: string[]
  rowsAffected: number
  lastInsertRowid?: number | bigint
}

async function getLibSqlClient(): Promise<LibSqlClient> {
  if (libSqlClient) return libSqlClient

  const localConfig = await loadLocalConfig()
  const url
    = process.env.TURSO_DATABASE_URL
      || process.env.TURSO_URL
      || localConfig.TURSO_DATABASE_URL
      || 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io'

  const authToken
    = process.env.TURSO_AUTH_TOKEN
      || localConfig.TURSO_AUTH_TOKEN
      || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg'

  libSqlClient = createClient({ url, authToken })
  return libSqlClient
}

export async function getDatabasePool(): Promise<pg.Pool> {
  if (pool) return pool

  const localConfig = await loadLocalConfig()
  const connectionString = process.env.DATABASE_URL || localConfig.DATABASE_URL

  if (!connectionString || (!connectionString.startsWith('postgres://') && !connectionString.startsWith('postgresql://'))) {
    throw new Error('No valid PostgreSQL DATABASE_URL configured')
  }

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000
  })

  pool.on('error', (err) => {
    console.error('[PostgreSQL Pool Error]', err)
  })

  return pool
}

async function executePgStatement(p: pg.Pool | pg.PoolClient, stmt: string | SqlStatement | InStatement, argsParam?: unknown): Promise<QueryResult> {
  let sql = typeof stmt === 'string' ? stmt : stmt.sql
  const rawArgs = typeof stmt === 'string' ? (argsParam || []) : (stmt.args || argsParam || [])

  let values: unknown[] = []
  if (Array.isArray(rawArgs)) {
    values = rawArgs
    sql = transformSql(sql)
  } else if (rawArgs && typeof rawArgs === 'object') {
    let paramIndex = 1
    values = []
    sql = sql.replace(/[:$]([a-zA-Z0-9_]+)/g, (_, name: string) => {
      values.push((rawArgs as Record<string, unknown>)[name])
      return `$${paramIndex++}`
    })
    sql = transformSql(sql)
  } else {
    sql = transformSql(sql)
  }

  // If INSERT statement without RETURNING clause, add RETURNING id if possible
  const isInsert = /^\s*INSERT\s+INTO/i.test(sql)
  if (isInsert && !/RETURNING/i.test(sql)) {
    sql = `${sql} RETURNING id`
  }

  let res: pg.QueryResult
  try {
    res = await p.query(sql, values)
  } catch (err: unknown) {
    const errorObj = err as { message?: string }
    // If RETURNING id failed because table has no id column, retry without RETURNING id
    if (isInsert && errorObj.message?.includes('column "id" does not exist')) {
      const cleanSql = sql.replace(/\s+RETURNING id\s*$/i, '')
      res = await p.query(cleanSql, values)
    } else {
      throw err
    }
  }

  const rows = (res.rows || []) as Record<string, unknown>[]
  const lastInsertRowid = rows.length > 0 && rows[0]?.id !== undefined ? Number(rows[0].id) : undefined

  return {
    rows,
    columns: res.fields ? res.fields.map(f => f.name) : [],
    rowsAffected: res.rowCount || 0,
    lastInsertRowid
  }
}

export interface TursoDbClient {
  execute: (stmt: string | SqlStatement | InStatement, args?: unknown) => Promise<QueryResult>
  batch: (stmts: (string | SqlStatement | InStatement)[]) => Promise<QueryResult[]>
  transaction: (mode?: 'write' | 'read' | 'deferred') => Promise<{
    execute: (stmt: string | SqlStatement | InStatement, args?: unknown) => Promise<QueryResult>
    commit: () => Promise<void>
    rollback: () => Promise<void>
    close: () => Promise<void>
  }>
}

export async function getTursoClient(): Promise<TursoDbClient> {
  const localConfig = await loadLocalConfig()
  const dbUrl = process.env.DATABASE_URL || localConfig.DATABASE_URL

  const isPostgresConfigured = Boolean(
    !useLibSqlFallback && dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))
  )

  const makeLibSqlWrapper = (client: LibSqlClient): TursoDbClient => ({
    execute: async (stmt: string | SqlStatement | InStatement, args?: unknown): Promise<QueryResult> => {
      const inStmt: InStatement = typeof stmt === 'string'
        ? { sql: stmt, args: (args as InArgs) || [] }
        : (stmt as InStatement)
      const res = await client.execute(inStmt)
      return {
        rows: (res.rows as unknown as Record<string, unknown>[]) || [],
        columns: res.columns || [],
        rowsAffected: res.rowsAffected || 0,
        lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined
      }
    },
    batch: async (stmts: (string | SqlStatement | InStatement)[]): Promise<QueryResult[]> => {
      const res = await client.batch(stmts as InStatement[])
      return res.map(r => ({
        rows: (r.rows as unknown as Record<string, unknown>[]) || [],
        columns: r.columns || [],
        rowsAffected: r.rowsAffected || 0,
        lastInsertRowid: r.lastInsertRowid !== undefined ? Number(r.lastInsertRowid) : undefined
      }))
    },
    transaction: async (mode?: 'write' | 'read' | 'deferred') => {
      const tx = await client.transaction(mode || 'write')
      return {
        execute: async (stmt: string | SqlStatement | InStatement, args?: unknown): Promise<QueryResult> => {
          const inStmt: InStatement = typeof stmt === 'string'
            ? { sql: stmt, args: (args as InArgs) || [] }
            : (stmt as InStatement)
          const res = await tx.execute(inStmt)
          return {
            rows: (res.rows as unknown as Record<string, unknown>[]) || [],
            columns: res.columns || [],
            rowsAffected: res.rowsAffected || 0,
            lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined
          }
        },
        commit: async () => { await tx.commit() },
        rollback: async () => { await tx.rollback() },
        close: async () => { await tx.close() }
      }
    }
  })

  if (!isPostgresConfigured) {
    const client = await getLibSqlClient()
    return makeLibSqlWrapper(client)
  }

  try {
    const p = await getDatabasePool()
    return {
      execute: async (stmt: string | SqlStatement | InStatement, args?: unknown): Promise<QueryResult> => {
        try {
          return await executePgStatement(p, stmt, args)
        } catch (err: unknown) {
          const errorObj = err as { code?: string, message?: string }
          if (errorObj.code === 'ECONNREFUSED' || errorObj.message?.includes('ECONNREFUSED') || errorObj.message?.includes('timeout')) {
            console.warn('[DB] PostgreSQL connection failed. Falling back to Turso LibSQL...', errorObj.message)
            useLibSqlFallback = true
            const fallback = await getLibSqlClient()
            return makeLibSqlWrapper(fallback).execute(stmt, args)
          }
          throw err
        }
      },
      batch: async (stmts: (string | SqlStatement | InStatement)[]): Promise<QueryResult[]> => {
        try {
          const client = await p.connect()
          try {
            await client.query('BEGIN')
            const results: QueryResult[] = []
            for (const s of stmts) {
              const res = await executePgStatement(client, s)
              results.push(res)
            }
            await client.query('COMMIT')
            return results
          } catch (err) {
            await client.query('ROLLBACK')
            throw err
          } finally {
            client.release()
          }
        } catch (err: unknown) {
          const errorObj = err as { code?: string, message?: string }
          if (errorObj.code === 'ECONNREFUSED' || errorObj.message?.includes('ECONNREFUSED') || errorObj.message?.includes('timeout')) {
            console.warn('[DB] PostgreSQL batch failed. Falling back to Turso LibSQL...', errorObj.message)
            useLibSqlFallback = true
            const fallback = await getLibSqlClient()
            return makeLibSqlWrapper(fallback).batch(stmts)
          }
          throw err
        }
      },
      transaction: async () => {
        const client = await p.connect()
        await client.query('BEGIN')
        let closed = false
        return {
          execute: async (stmt: string | SqlStatement | InStatement, args?: unknown): Promise<QueryResult> => {
            return await executePgStatement(client, stmt, args)
          },
          commit: async () => {
            if (!closed) {
              await client.query('COMMIT')
              client.release()
              closed = true
            }
          },
          rollback: async () => {
            if (!closed) {
              await client.query('ROLLBACK')
              client.release()
              closed = true
            }
          },
          close: async () => {
            if (!closed) {
              await client.release()
              closed = true
            }
          }
        }
      }
    }
  } catch (err: unknown) {
    const errorObj = err as { message?: string }
    console.warn('[DB] Could not initialize PostgreSQL pool. Falling back to Turso LibSQL...', errorObj.message)
    useLibSqlFallback = true
    const fallback = await getLibSqlClient()
    return makeLibSqlWrapper(fallback)
  }
}
