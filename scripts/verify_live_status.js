import { Client } from 'ssh2';

const conn = new Client();

const checkCmd = `
export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH
echo "=== PM2 Status ==="
pm2 list

echo "\n=== PM2 Logs (Last 25 lines) ==="
pm2 logs salomkorea --lines 25 --nostream

echo "\n=== Crontab Check ==="
crontab -l || true
`;

conn.on('ready', () => {
  conn.exec(checkCmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => {
      conn.end();
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
