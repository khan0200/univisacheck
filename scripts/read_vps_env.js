import { Client } from 'ssh2'

const conn = new Client()

// Read the .env file from production VPS
const readEnvCommand = `
cat /www/wwwroot/salomkorea/nuxt-app/.env 2>/dev/null || echo "NO .env FILE FOUND"
echo "---"
cat /www/wwwroot/salomkorea/.env 2>/dev/null || echo "NO ROOT .env FILE"
echo "---"
# Also check PM2 env vars
pm2 show salomkorea 2>/dev/null | grep -E "env|ENV|SECRET|TOKEN|KEY|DATABASE|PUSHER|TELEGRAM|OPENAI|GEMINI|CRON"
`

conn.on('ready', () => {
  console.log('✅ SSH connected. Reading .env from VPS...\n')
  conn.exec(readEnvCommand, (err, stream) => {
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
