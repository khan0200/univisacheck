import { Client } from 'ssh2';

const script = `async function check() {
  // Login with test@example.com
  const loginRes = await fetch('http://127.0.0.1:3000/api/auth?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: '123123123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Login result:', token ? 'Success' : 'Failed', 'Token:', token ? token.slice(0, 15) + '...' : 'none');

  const passports = ['FB1291661', 'FB2442582', 'FB2440210', 'FB2590045'];
  for (const passport of passports) {
    const t0 = Date.now();
    const checkRes = await fetch('http://127.0.0.1:3000/api/jobs/direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ passport })
    });
    const checkData = await checkRes.json();
    console.log('Direct check for ' + passport + ' in ' + (Date.now() - t0) + 'ms:', checkData);
  }

  // Check GET /api/students as the client sees it
  const studentsRes = await fetch('http://127.0.0.1:3000/api/students', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const studentsData = await studentsRes.json();
  console.log('\\nStudents returned from GET /api/students:');
  for (const s of studentsData.filter(x => passports.includes(x.passport))) {
    console.log({
      passport: s.passport,
      name: s.fullName,
      status: s.status,
      lastChecked: s.lastChecked,
      last_checked: s.last_checked
    });
  }
}

check().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/test_live_direct_endpoint.js');
    ws.write(script);
    ws.end();
    ws.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/test_live_direct_endpoint.js', (e, stream) => {
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
