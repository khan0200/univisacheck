import { Client } from 'ssh2'

const conn = new Client()

// Check which users have valid bcrypt hashes in PostgreSQL
const checkCommand = `
export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH
cd /www/wwwroot/salomkorea/nuxt-app

node --input-type=module << 'EOF'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'
})

async function main() {
  const all = await pool.query('SELECT id, email, username, password FROM users ORDER BY id')
  
  console.log('\\n=== CHECKING ALL USER PASSWORD HASHES ===\\n')
  
  const results = []
  for (const user of all.rows) {
    const hash = user.password || ''
    const isValidBcrypt = hash.startsWith('$2b$') || hash.startsWith('$2a$')
    results.push({
      id: user.id,
      username: user.username,
      email: user.email,
      hash_ok: isValidBcrypt ? '✅ valid bcrypt' : '❌ BROKEN/EMPTY',
      hash_preview: hash.substring(0, 25) + '...'
    })
  }
  
  console.table(results)
  
  const broken = results.filter(r => r.hash_ok.includes('BROKEN'))
  console.log('\\n--- SUMMARY ---')
  console.log('Total users:', results.length)
  console.log('Valid bcrypt hashes:', results.length - broken.length)
  console.log('Broken/empty hashes:', broken.length)
  
  if (broken.length > 0) {
    console.log('\\n⚠️  Broken users (need password reset):')
    broken.forEach(u => console.log(' -', u.username, '|', u.email))
  }
  
  await pool.end()
}

main().catch(e => { console.error(e.message); pool.end() })
EOF
`

console.log('🔍 Checking all user passwords on VPS...')

conn.on('ready', () => {
  console.log('✅ SSH connected.\n')
  conn.exec(checkCommand, (err, stream) => {
    if (err) throw err
    stream.on('data', (d) => process.stdout.write(d.toString()))
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()))
    stream.on('close', () => { conn.end() })
  })
}).on('error', (err) => {
  console.error('❌ SSH error:', err.message)
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
})
