import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pg

const pool = new Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db',
  connectionTimeoutMillis: 8000
})

async function main() {
  console.log('Connecting to production DB...')

  // Check if user exists
  const result = await pool.query(
    "SELECT id, email, username, password, created_at FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1",
    ['unibridge']
  )

  if (result.rows.length === 0) {
    console.log('❌ User "Unibridge" NOT FOUND in database!')
    console.log('\n--- All users in DB ---')
    const all = await pool.query('SELECT id, email, username, created_at FROM users ORDER BY id')
    console.table(all.rows)
  } else {
    const user = result.rows[0]
    console.log('✅ User found:')
    console.log(`  ID: ${user.id}`)
    console.log(`  Email: ${user.email}`)
    console.log(`  Username: ${user.username}`)
    console.log(`  Created: ${user.created_at}`)
    console.log(`  Password hash: ${user.password?.substring(0, 20)}...`)

    // Check password
    const match = await bcrypt.compare('11981198', user.password)
    console.log(`\n🔑 Password "11981198" match: ${match ? '✅ YES' : '❌ NO'}`)
  }

  await pool.end()
}

main().catch(e => {
  console.error('Error:', e.message)
  pool.end()
})
