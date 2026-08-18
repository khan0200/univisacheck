import { Client } from 'ssh2';

const script = `import { checkVisaDirect } from '/www/wwwroot/salomkorea/nuxt-app/server/lib/direct-visa-check.js';

async function test() {
  console.log('--- TEST 1: FB1291661 (Embassy) ---');
  const res1 = await checkVisaDirect('FB1291661', 'ABDIEV ABDUMALIK ABDIRAKHMON UGLI', '2008-08-25', 'Embassy', '');
  console.log('Result for FB1291661:', res1);

  console.log('\\n--- TEST 2: FA8686092 (E-Visa) ---');
  const res2 = await checkVisaDirect('FA8686092', 'ISOKOVA BIBISARA MUZAFAR KIZI', '2000-06-27', 'E-Visa', '7102350001');
  console.log('Result for FA8686092:', res2);

  console.log('\\n--- TEST 3: FB2442582 (Embassy) ---');
  const res3 = await checkVisaDirect('FB2442582', 'RASHIDOV AKOBIR ALISHER UGLI', '2006-08-08', 'Embassy', '');
  console.log('Result for FB2442582:', res3);
}

test().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/inspect_html_structure.js');
    writeStream.write(script);
    writeStream.end();
    writeStream.on('close', () => {
      // First push direct-visa-check.js to VPS so we can test immediately
      conn.sftp((err2, sftp2) => {
        if (err2) throw err2;
        import('node:fs').then(fs => {
          const localCode = fs.readFileSync('c:/Users/User/Desktop/univisacheck/nuxt-app/server/lib/direct-visa-check.js', 'utf8');
          const ws = sftp2.createWriteStream('/www/wwwroot/salomkorea/nuxt-app/server/lib/direct-visa-check.js');
          ws.write(localCode);
          ws.end();
          ws.on('close', () => {
            conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/inspect_html_structure.js', (e, stream) => {
              if (e) throw e;
              stream.on('data', d => process.stdout.write(d.toString()));
              stream.stderr.on('data', d => process.stderr.write(d.toString()));
              stream.on('close', code => {
                conn.end();
              });
            });
          });
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
