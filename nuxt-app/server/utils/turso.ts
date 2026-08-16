import pg from 'pg'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const { Pool } = pg

let pool: pg.Pool | null = null

async function loadLocalConfig(): Promise<{ DATABASE_URL?: string, TURSO_DATABASE_URL?: string }> {
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (!existsSync(configPath)) return {}
    const mod = await import(pathToFileURL(configPath).href)
    return mod.default || mod
  } catch {
    return {}
  }
}

export function transformSql(sql: string): string {
  let paramIndex = 1
  let inSingleQuote = false
  let inDoubleQuote = false
  let result = ''

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    if (char === "'" && (i === 0 || sql[i - 1] !== '\\')) {
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

  return result
}

export interface SqlStatement {
  sql: string
  args?: any[] | Record<string, any>
}

export interface QueryResult<T = any> {
  rows: T[]
  columns: string[]
  rowsAffected: number
}

export async function getDatabasePool(): Promise<pg.Pool> {
  if (pool) return pool

  const localConfig = await loadLocalConfig()
  const connectionString =
    process.env.DATABASE_URL ||
    localConfig.DATABASE_URL ||
    'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  })

  pool.on('error', (err) => {
    console.error('[PostgreSQL Pool Error]', err)
  })

  return pool
}

async function executeStatement(p: pg.Pool, stmt: string | SqlStatement, argsParam?: any[]): Promise<QueryResult> {
  let sql = typeof stmt === 'string' ? stmt : stmt.sql
  const rawArgs = typeof stmt === 'string' ? (argsParam || []) : (stmt.args || argsParam || [])

  let values: any[] = []
  if (Array.isArray(rawArgs)) {
    values = rawArgs
    sql = transformSql(sql)
  } else if (rawArgs && typeof rawArgs === 'object') {
    let paramIndex = 1
    values = []
    sql = sql.replace(/[:$]([a-zA-Z0-9_]+)/g, (_, name) => {
      values.push((rawArgs as Record<string, any>)[name])
      return `$${paramIndex++}`
    })
  }

  const res = await p.query(sql, values)
  return {
    rows: res.rows || [],
    columns: res.fields ? res.fields.map(f => f.name) : [],
    rowsAffected: res.rowCount || 0
  }
}

export async function getTursoClient() {
  const p = await getDatabasePool()

  return {
    execute: (stmt: string | SqlStatement, args?: any[]) => executeStatement(p, stmt, args),
    batch: async (stmts: (string | SqlStatement)[]) => {
      const client = await p.connect()
      try {
        await client.query('BEGIN')
        const results = []
        for (const s of stmts) {
          let sql = typeof s === 'string' ? s : s.sql
          const rawArgs = typeof s === 'string' ? [] : (s.args || [])
          let values: any[] = []
          if (Array.isArray(rawArgs)) {
            values = rawArgs
            sql = transformSql(sql)
          } else if (rawArgs && typeof rawArgs === 'object') {
            let paramIndex = 1
            values = []
            sql = sql.replace(/[:$]([a-zA-Z0-9_]+)/g, (_, name) => {
              values.push((rawArgs as Record<string, any>)[name])
              return `$${paramIndex++}`
            })
          }
          const res = await client.query(sql, values)
          results.push({
            rows: res.rows || [],
            columns: res.fields ? res.fields.map(f => f.name) : [],
            rowsAffected: res.rowCount || 0
          })
        }
        await client.query('COMMIT')
        return results
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    }
  }
}
