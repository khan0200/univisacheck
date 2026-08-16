import { Client } from 'ssh2'

const conn = new Client()

// This script:
// 1. Lists all users in PostgreSQL
// 2. Re-hashes and resets password for 'Unibridge' user (and optionally others)

const fixPasswordCommand = `
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
  // 1. Show all users
  const all = await pool.query('SELECT id, email, username, LEFT(password, 30) as password_preview, "createdAt" FROM users ORDER BY id')
  console.log('\\n=== ALL USERS IN POSTGRESQL ===')
  console.table(all.rows)

  // 2. Fix Unibridge password
  const newHash = await bcrypt.hash('11981198', 12)
  const result = await pool.query(
    "UPDATE users SET password = \\$1 WHERE LOWER(username) = 'unibridge' RETURNING id, email, username",
    [newHash]
  )

  if (result.rows.length > 0) {
    console.log('\\n✅ Password updated for:', result.rows[0])
  } else {
    console.log('\\n❌ User "Unibridge" NOT FOUND. Creating...')

    // Create fresh user if not exists
    const hash = await bcrypt.hash('11981198', 12)
    const created = await pool.query(
      'INSERT INTO users (email, username, password) VALUES ($1, $2, $3) RETURNING id, email, username',
      ['unibridge@salomkorea.uz', 'Unibridge', hash]
    )
    console.log('✅ User created:', created.rows[0])
  }

  // 3. Verify login works
  const verify = await pool.query("SELECT id, email, username, password FROM users WHERE LOWER(username) = 'unibridge'")
  if (verify.rows.length > 0) {
    const user = verify.rows[0]
    const match = await bcrypt.compare('11981198', user.password)
    console.log('\\n🔑 Password verification test:', match ? '✅ PASS' : '❌ FAIL')
  }

  await pool.end()
}

main().catch(e => { console.error(e.message); pool.end() })
EOF
`

console.log('🔧 Connecting to VPS to fix Unibridge password...')

conn.on('ready', () => {
  console.log('✅ SSH connected. Running password fix...\n')
  conn.exec(fixPasswordCommand, (err, stream) => {
    if (err) throw err
    stream.on('data', (d) => process.stdout.write(d.toString()))
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()))
    stream.on('close', (code) => {
      if (code === 0 || code === null) {
        console.log('\n🎉 Done!')
      } else {
        console.error(`\n❌ Failed with exit code: ${code}`)
      }
      conn.end()
    })
  })
}).on('error', (err) => {
  console.error('❌ SSH error:', err.message)
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
})
