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
      const pKey = table.toLowerCase() === 'visa_sessions' ? 'key'
        : table.toLowerCase() === 'students' ? '"userId", passport'
        : 'id'
      const updateSet = colList.map(c => `${c} = EXCLUDED.${c}`).join(', ')
      return `INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT (${pKey}) DO UPDATE SET ${updateSet}`
    })
  }

  result = result.replace(/datetime\(['"]now['"]\)/gi, 'CURRENT_TIMESTAMP')

  const CAMEL_IDENTIFIERS = [
    'userId', 'fullName', 'studentId', 'applicationDate', 'lastChecked',
    'rejectReason', 'pdfUrl', 'apiResponse', 'batchSelected',
    'batchSelectedUpdatedAt', 'createdAt', 'visaType', 'applicationNo',
    'deletedAt', 'checkSource', 'updatedAt', 'jobId', 'lockedAt',
    'lockedBy', 'startedAt', 'completedAt', 'fetchedAt'
  ]
  const CAMEL_REGEX = new RegExp(`(?<!["'a-zA-Z0-9_])(${CAMEL_IDENTIFIERS.join('|')})(?!["'a-zA-Z0-9_])`, 'g')
  result = result.replace(CAMEL_REGEX, '"$1"')

  return result
}

const replaceSql = "INSERT OR REPLACE INTO visa_sessions (key, cookies, fetchedAt) VALUES ('current', $1, $2)";
console.log('Transformed INSERT OR REPLACE:');
console.log(transformSql(replaceSql));
