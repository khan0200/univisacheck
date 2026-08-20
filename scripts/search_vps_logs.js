import { Client } from 'ssh2';

const conn = new Client();

const checkCommand = `
grep -a "FA0135684" /root/.pm2/logs/salomkorea-out.log /root/.pm2/logs/salomkorea-error.log || echo "No matches in PM2 logs"
echo "=== Last 200 lines of out.log ==="
tail -n 200 /root/.pm2/logs/salomkorea-out.log
`;

conn.on('ready', () => {
  console.log('Searching logs on VPS...\n');
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
