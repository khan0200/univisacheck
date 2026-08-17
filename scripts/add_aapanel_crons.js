import { Client } from 'ssh2';

const conn = new Client();

const pythonScript = `
import sys
sys.path.append('/www/server/panel/class')
import crontab

c = crontab.crontab()

# 1. Add 10-minute cron
res1 = c.AddCrontab({
    'name': '10 Min Auto Visa Check',
    'type': 'minute-n',
    'where1': '10',
    'hour': '',
    'minute': '',
    'sType': 'toShell',
    'sName': '',
    'sBody': 'curl -s -X POST http://127.0.0.1:3000/api/cron/check-selected',
    'urladdress': '',
    'save': '',
    'backupTo': ''
})
print("10-Min Task added:", res1)

# 2. Add 6-hour cron
res2 = c.AddCrontab({
    'name': '6 Hour Auto Visa Check',
    'type': 'hour-n',
    'where1': '6',
    'hour': '',
    'minute': '0',
    'sType': 'toShell',
    'sName': '',
    'sBody': 'curl -s -X POST http://127.0.0.1:3000/api/cron/check-all-pending',
    'urladdress': '',
    'save': '',
    'backupTo': ''
})
print("6-Hour Task added:", res2)
`;

conn.on('ready', () => {
  console.log('✅ Connected to VPS. Registering cron tasks into aaPanel database...\n');
  const command = `cat << 'EOF' > /tmp/add_aapanel_cron.py\n${pythonScript}\nEOF\n/www/server/panel/pyenv/bin/python /tmp/add_aapanel_cron.py && rm -f /tmp/add_aapanel_cron.py`;
  
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', code => {
      console.log(`\nProcess exited with code ${code}`);
      conn.end();
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
