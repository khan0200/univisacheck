import { Client } from 'ssh2';

const conn = new Client();

const checkCommand = `
echo "=== 1. System Crontab (root) ==="
crontab -l || echo "No crontab for root"

echo "\n=== 2. /etc/cron* files ==="
ls -la /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly 2>/dev/null || true

echo "\n=== 3. aaPanel Cron database ==="
python3 -c "
import sqlite3
try:
    conn = sqlite3.connect('/www/server/panel/data/default.db')
    c = conn.cursor()
    c.execute('SELECT id, name, type, where1, sBody FROM crontab')
    rows = c.fetchall()
    print('Found aaPanel crontabs:', len(rows))
    for r in rows:
        print('  ID:', r[0], '| Name:', r[1], '| Type:', r[2], '| Where:', r[3], '| Body:', r[4])
except Exception as e:
    print('Error reading aaPanel db:', e)
" 2>/dev/null || true

echo "\n=== 4. PM2 list & timers ==="
export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH
pm2 list

echo "\n=== 5. Active processes related to curl / check / node ==="
ps aux | grep -E 'curl|check|worker|cron' | grep -v grep || true
`;

conn.on('ready', () => {
  console.log('✅ Connected via SSH. Checking crons and processes...\n');
  conn.exec(checkCommand, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', code => {
      console.log(`\nDone. Exit code: ${code}`);
      conn.end();
    });
  });
}).on('error', err => {
  console.error('❌ SSH Connection error:', err.message);
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
