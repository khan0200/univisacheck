const { Pool } = require('pg')
const path = require('path')
const { existsSync } = require('fs')
const { pathToFileURL } = require('url')

let pool = null

async function loadLocalConfig() {
  try {
    const configPath = path.join(process.cwd(), '..', 'turso.config.js')
    if (!existsSync(configPath)) return {}
    const mod = await import(pathToFileURL(configPath).href)
    return mod.default || mod
  } catch {
    return {}
  }
}

function transformSql(sql) {
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

async function getPool() {
  if (pool) return pool
  const config = await loadLocalConfig()
  const connectionString =
    process.env.DATABASE_URL ||
    config.DATABASE_URL ||
    'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  })

  pool.on('error', (err) => {
    console.error('[PostgreSQL CJS Pool Error]', err)
  })

  return pool
}

async function execute(stmt, argsParam) {
  const p = await getPool()
  let sql = typeof stmt === 'string' ? stmt : stmt.sql
  const rawArgs = typeof stmt === 'string' ? (argsParam || []) : (stmt.args || argsParam || [])

  let values = []
  if (Array.isArray(rawArgs)) {
    values = rawArgs
    sql = transformSql(sql)
  } else if (rawArgs && typeof rawArgs === 'object') {
    let paramIndex = 1
    values = []
    sql = sql.replace(/[:$]([a-zA-Z0-9_]+)/g, (_, name) => {
      values.push(rawArgs[name])
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

async function batch(stmts) {
  const p = await getPool()
  const client = await p.connect()
  try {
    await client.query('BEGIN')
    const results = []
    for (const s of stmts) {
      let sql = typeof s === 'string' ? s : s.sql
      const rawArgs = typeof s === 'string' ? [] : (s.args || [])
      let values = []
      if (Array.isArray(rawArgs)) {
        values = rawArgs
        sql = transformSql(sql)
      } else if (rawArgs && typeof rawArgs === 'object') {
        let paramIndex = 1
        values = []
        sql = sql.replace(/[:$]([a-zA-Z0-9_]+)/g, (_, name) => {
          values.push(rawArgs[name])
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

module.exports = {
  execute,
  batch
}
