import { Client } from 'ssh2';

const conn = new Client();

const pythonScript = `
import sqlite3
try:
    conn = sqlite3.connect('/www/server/panel/data/default.db')
    c = conn.cursor()
    c.execute("DELETE FROM crontab WHERE name LIKE '%Visa Check%' OR sBody LIKE '%/api/cron/%'")
    conn.commit()
    print('Deleted auto-check rows from aaPanel DB. Remaining:')
    c.execute('SELECT id, name, sBody FROM crontab')
    for r in c.fetchall():
        print(' ', r)
    conn.close()
except Exception as e:
    print('Error with aaPanel DB:', e)
`;

const cleanCommand = `
cat << 'EOF' > /tmp/clean_aapanel_crons.py
${pythonScript}
EOF
python3 /tmp/clean_aapanel_crons.py
rm -f /tmp/clean_aapanel_crons.py

echo "\n=== 2. Cleaning System Crontab ==="
crontab -l | grep -v 'api/cron' | grep -v 'check-selected' | grep -v 'check-all-pending' | crontab -
crontab -l

echo "\n=== 3. Checking & Cleaning pending visa_check_tasks in PostgreSQL ==="
sudo -u postgres psql -d salomkorea_db -c "SELECT status, count(*) FROM visa_check_jobs GROUP BY status;" || true
sudo -u postgres psql -d salomkorea_db -c "SELECT status, count(*) FROM visa_check_tasks GROUP BY status;" || true
sudo -u postgres psql -d salomkorea_db -c "UPDATE visa_check_jobs SET status = 'cancelled' WHERE status IN ('queued', 'processing');" || true
sudo -u postgres psql -d salomkorea_db -c "UPDATE visa_check_tasks SET status = 'cancelled' WHERE status IN ('queued', 'processing');" || true

echo "\n=== 4. Terminating any rogue curl check processes ==="
pkill -f "check-selected" || true
pkill -f "check-all-pending" || true
echo "Clean up finished."
`;

conn.on('ready', () => {
  console.log('✅ Connected via SSH. Cleaning crons and jobs on VPS...\n');
  conn.exec(cleanCommand, (err, stream) => {
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
