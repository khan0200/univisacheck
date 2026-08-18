import { Client } from 'ssh2';

const testScript = `async function test() {
  const res = await fetch('http://127.0.0.1:3000/api/ai-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Salom, Koreyada oqish uchun qanday viza turlari mavjud?' })
  });
  const data = await res.json();
  console.log('AI Response status:', res.status);
  console.log('AI Response data:', data);
}

test().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/test_ai_live.js');
    ws.write(testScript);
    ws.end();
    ws.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/test_ai_live.js', (e, stream) => {
        if (e) throw e;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => {
          conn.end();
        });
      });
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
