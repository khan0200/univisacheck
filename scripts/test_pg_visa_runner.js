import { Client } from 'ssh2';

const script = `import pg from '/www/wwwroot/salomkorea/nuxt-app/node_modules/pg/lib/index.js';
import https from 'node:https';
import querystring from 'node:querystring';

function httpReq(headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.visa.go.kr',
      port: 443,
      path: '/openPage.do?MENU_ID=10301',
      method: 'POST',
      family: 4,
      agent: false,
      headers,
      timeout: 10000
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('timeout', () => {
      req.destroy(new Error('Socket timeout after 10s'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const pool = new pg.Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'
});

async function main() {
  const { rows } = await pool.query("SELECT * FROM students WHERE passport IN ('FB1291661', 'FB2442582', 'FB2440210', 'FB2590045')");

  for (const st of rows) {
    console.log('\\n--------------------------------------------------');
    const name = st.fullName || '';
    const bday = st.birthday || '';
    const passport = st.passport;
    console.log('Testing student:', name, 'Passport:', passport, 'DOB:', bday);

    const bodyParams = {
      pRADIOSEARCH: 'gb03',
      sBUSI_GB: 'PASS_NO',
      sBUSI_GBNO: passport.toUpperCase().trim(),
      ssBUSI_GBNO: passport.toUpperCase().trim(),
      sEK_NM: name.toUpperCase().trim(),
      sFROMDATE: bday,
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
      'Content-Length': String(Buffer.byteLength(body))
    };

    const t0 = Date.now();
    try {
      const res = await httpReq(headers, body);
      console.log('Response in ' + (Date.now() - t0) + 'ms, HTTP status:', res.status, 'HTML length:', res.body.length);
      const isFound = res.body.includes('PROC_STS_CDNM_1') || res.body.includes('result3_2');
      console.log('Is found in visa.go.kr:', isFound);
      if (isFound) {
        const match = res.body.match(/id="PROC_STS_CDNM_1"[^>]*>([\\s\\S]*?)<\\/div>/);
        console.log('Raw status match:', match ? match[1].trim() : 'none');
      }
    } catch (e) {
      console.error('Error querying visa.go.kr in ' + (Date.now() - t0) + 'ms:', e.message);
    }
  }

  await pool.end();
}

main().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/check_student_db_and_visa.js');
    writeStream.write(script);
    writeStream.end();
    writeStream.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/check_student_db_and_visa.js', (e, stream) => {
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
