import { Client } from 'ssh2';

const conn = new Client();

const command = process.argv.slice(2).join(' ') || 'whoami && pm2 status && curl -I http://127.0.0.1:3000';

conn.on('ready', () => {
  console.log(`[SSH] Connected to VPS. Running: "${command}"\n`);
  conn.exec(command, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', (code) => {
      console.log(`\n[SSH] Command exited with code: ${code}`);
      conn.end();
    });
  });
}).on('error', (err) => {
  console.error('[SSH] Error:', err.message);
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
