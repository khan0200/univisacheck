import { Client } from 'ssh2';

const testScript = `import https from 'node:https';
import querystring from 'node:querystring';

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 20,
  maxFreeSockets: 10,
  timeout: 10000
});

let cachedCookies = '';

function doCheck(passport, name, dob) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const bodyParams = {
      pRADIOSEARCH: 'gb03',
      sBUSI_GB: 'PASS_NO',
      sBUSI_GBNO: passport,
      ssBUSI_GBNO: passport,
      sEK_NM: name,
      sFROMDATE: dob,
      sMainPopUpGB: 'main'
    };
    const body = querystring.stringify(bodyParams);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
      'Origin': 'https://www.visa.go.kr',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(body)),
      'Connection': 'keep-alive'
    };
    if (cachedCookies) {
      headers['Cookie'] = cachedCookies;
    }

    const req = https.request({
      hostname: 'www.visa.go.kr',
      port: 443,
      path: '/openPage.do?MENU_ID=10301',
      method: 'POST',
      family: 4,
      agent: httpsAgent,
      headers,
      timeout: 10000
    }, (res) => {
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        cachedCookies = setCookie.map(c => c.split(';')[0]).join('; ');
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const elapsed = Date.now() - t0;
        resolve({ passport, elapsed, status: res.statusCode, hasResults: chunks.length > 0 });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log('--- Checking 4 students sequentially with Keep-Alive Agent ---');
  const s1 = await doCheck('FB1963267', 'TEST', '2008-05-18');
  console.log('Student 1:', s1);

  const s2 = await doCheck('FB2032704', 'TEST', '2006-01-01');
  console.log('Student 2:', s2);

  const s3 = await doCheck('FA8686092', 'TEST', '2005-05-05');
  console.log('Student 3:', s3);

  const s4 = await doCheck('FB1029869', 'TEST', '2004-04-04');
  console.log('Student 4:', s4);

  console.log('\\n--- Checking 4 students in parallel (Promise.all) ---');
  const tStart = Date.now();
  const results = await Promise.all([
    doCheck('FB1963267', 'TEST', '2008-05-18'),
    doCheck('FB2032704', 'TEST', '2006-01-01'),
    doCheck('FA8686092', 'TEST', '2005-05-05'),
    doCheck('FB1029869', 'TEST', '2004-04-04')
  ]);
  console.log('Parallel 4 checks completed in ' + (Date.now() - tStart) + 'ms:');
  console.log(results);
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/test_keepalive_speed.js');
    writeStream.write(testScript);
    writeStream.end();
    writeStream.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/test_keepalive_speed.js', (e, stream) => {
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
