import { Client } from 'ssh2';

const testScript = `import { checkVisaDirect, getSession } from '/www/wwwroot/salomkorea/nuxt-app/server/lib/direct-visa-check.js';

async function test() {
  console.log('--- TEST 1: Session fetch time ---');
  let t0 = Date.now();
  const session = await getSession();
  console.log('Session acquired in ' + (Date.now() - t0) + 'ms: ' + session.substring(0, 40) + '...');

  console.log('\\n--- TEST 2: Single Visa Check ---');
  t0 = Date.now();
  const res1 = await checkVisaDirect('FB1963267', 'TEST', '2008-05-18');
  console.log('Visa check 1 completed in ' + (Date.now() - t0) + 'ms:', {
    found: res1.found,
    latestStatus: res1.latestStatus,
    latestDate: res1.latestDate
  });

  console.log('\\n--- TEST 3: Second Visa Check (Reusing Session) ---');
  t0 = Date.now();
  const res2 = await checkVisaDirect('FB2032704', 'TEST', '2006-01-01');
  console.log('Visa check 2 completed in ' + (Date.now() - t0) + 'ms:', {
    found: res2.found,
    latestStatus: res2.latestStatus,
    latestDate: res2.latestDate
  });
}

test().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/live_perf_test.js');
    writeStream.write(testScript);
    writeStream.end();
    writeStream.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/live_perf_test.js', (e, stream) => {
        if (e) throw e;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => {
          console.log(`Live test finished with code ${code}`);
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
