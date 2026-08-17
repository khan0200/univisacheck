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

const CAMEL_IDENTIFIERS = [
  'userId', 'fullName', 'studentId', 'applicationDate', 'lastChecked',
  'rejectReason', 'pdfUrl', 'apiResponse', 'batchSelected',
  'batchSelectedUpdatedAt', 'createdAt', 'visaType', 'applicationNo',
  'deletedAt', 'checkSource', 'updatedAt', 'jobId', 'lockedAt',
  'lockedBy', 'startedAt', 'completedAt', 'fetchedAt'
]
const CAMEL_REGEX = new RegExp(`(?<!["'a-zA-Z0-9_])(${CAMEL_IDENTIFIERS.join('|')})(?!["'a-zA-Z0-9_])`, 'g')

function transformSql(sql) {
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
      const colList = cols.split(',').map(c => c.trim())
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
      const updateSet = colList.map(c => `${c} = EXCLUDED.${c}`).join(', ')
      return `INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT (${pKey}) DO UPDATE SET ${updateSet}`
    })
  }

  result = result.replace(/datetime\(['"]now['"]\s*,\s*['"]\+([^'"]+)['"]\)/gi, '(CURRENT_TIMESTAMP + INTERVAL \'$1\')')
  result = result.replace(/datetime\(['"]now['"]\s*,\s*['"]-([^'"]+)['"]\)/gi, '(CURRENT_TIMESTAMP - INTERVAL \'$1\')')
  result = result.replace(/datetime\(['"]now['"]\)/gi, 'CURRENT_TIMESTAMP')

  // Auto-quote camelCase column names for PostgreSQL
  result = result.replace(CAMEL_REGEX, '"$1"')

  return result
}

async function getPool() {
  if (pool) return pool
  const config = await loadLocalConfig()
  const connectionString
    = process.env.DATABASE_URL
      || config.DATABASE_URL
      || 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'

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
