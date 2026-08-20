import { Client } from 'ssh2';

const conn = new Client();

const checkCommand = `
cd /www/wwwroot/salomkorea/nuxt-app
git log -n 5 --oneline
git status
`;

conn.on('ready', () => {
  console.log('Checking VPS git status...\n');
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
