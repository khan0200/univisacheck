import { Client } from 'ssh2';

const testScript = `import https from 'node:https';
import querystring from 'node:querystring';

const bodyParams = {
  pRADIOSEARCH: 'gb03',
  sBUSI_GB: 'PASS_NO',
  sBUSI_GBNO: 'FB1963267',
  ssBUSI_GBNO: 'FB1963267',
  sEK_NM: 'TEST',
  sFROMDATE: '2008-05-18',
  sMainPopUpGB: 'main'
};
const body = querystring.stringify(bodyParams);

console.log('Sending single DIRECT POST without pre-fetching session...');
const t0 = Date.now();

const req = https.request({
  hostname: 'www.visa.go.kr',
  port: 443,
  path: '/openPage.do?MENU_ID=10301',
  method: 'POST',
  family: 4,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
    'Origin': 'https://www.visa.go.kr',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': String(Buffer.byteLength(body))
  },
  timeout: 10000
}, (res) => {
  console.log('POST Response status in ' + (Date.now() - t0) + 'ms:', res.statusCode);
  console.log('Set-Cookie:', res.headers['set-cookie']);
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const html = Buffer.concat(chunks).toString('utf8');
    console.log('Response body length:', html.length);
    console.log('Contains result section?', html.includes('PROC_STS_CDNM') || html.includes('result3_2') || html.includes('APPL_YMD') || html.includes('신청'));
  });
});

req.on('error', (err) => console.error('Request error in ' + (Date.now() - t0) + 'ms:', err.message));
req.on('timeout', () => {
  console.error('Request TIMEOUT in ' + (Date.now() - t0) + 'ms');
  req.destroy();
});
req.write(body);
req.end();
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/test_direct_post.js');
    writeStream.write(testScript);
    writeStream.end();
    writeStream.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/test_direct_post.js', (e, stream) => {
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
