import { Client } from 'ssh2'

const conn = new Client()
const TOKEN = '8628603817:AAEDMIsRb0JRichfx_NmwhMszHpiNiUEI-4'

const command = `
export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH

# 1. Update .env on VPS
ENV_FILE="/www/wwwroot/salomkorea/nuxt-app/.env"

if grep -q "TELEGRAM_BOT_TOKEN" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${TOKEN}|" "$ENV_FILE"
  echo "✅ Updated TELEGRAM_BOT_TOKEN in existing .env"
else
  echo "TELEGRAM_BOT_TOKEN=${TOKEN}" >> "$ENV_FILE"
  echo "✅ Added TELEGRAM_BOT_TOKEN to .env"
fi

echo "--- Current .env ---"
cat "$ENV_FILE"

# 2. Reload PM2 with new env
echo ""
echo "=== Reloading PM2 ==="
pm2 restart salomkorea --update-env
pm2 save

# 3. Wait a bit for server to start
sleep 3

# 4. Register Telegram webhook
echo ""
echo "=== Registering Telegram Webhook ==="
curl -s "https://www.salomkorea.uz/api/webhook" | head -c 500

echo ""
echo "=== Checking webhook status ==="
curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" | head -c 500
`

console.log('🚀 Connecting to VPS...')

conn.on('ready', () => {
  console.log('✅ SSH connected. Setting up Telegram bot...\n')
  conn.exec(command, (err, stream) => {
    if (err) throw err
    stream.on('data', (d) => process.stdout.write(d.toString()))
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()))
    stream.on('close', () => {
      console.log('\n✅ Done!')
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
