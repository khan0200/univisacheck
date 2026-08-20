import { Client } from 'ssh2';

const conn = new Client();

const checkCommand = `
echo "=== 1. System Crontab (root) ==="
crontab -l 2>&1

echo "=== 2. aaPanel Cron database ==="
python3 -c "
import sqlite3
conn = sqlite3.connect('/www/server/panel/data/default.db')
c = conn.cursor()
c.execute('SELECT id, name, type, where1, sBody FROM crontab')
for r in c.fetchall():
    print(r)
" 2>&1

echo "=== 3. Checking /var/spool/cron/crontabs ==="
cat /var/spool/cron/crontabs/* 2>&1 || true
`;

conn.on('ready', () => {
  conn.exec(checkCommand, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', code => {
      conn.end();
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
