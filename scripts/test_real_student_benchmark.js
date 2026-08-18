import { Client } from 'ssh2';

const conn = new Client();

const remoteScript = `
export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH
cd /www/wwwroot/salomkorea/nuxt-app

echo "================================================================="
echo " 🎓 REAL STUDENT DATABASE BENCHMARK TEST (VPS -> VISA.GO.KR) "
echo "================================================================="

node --input-type=module << 'EOF'
import pg from 'pg';
import https from 'https';
import querystring from 'querystring';
import dns from 'dns';
import { performance } from 'perf_hooks';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'
});

const visaAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 6,
  maxFreeSockets: 4,
  timeout: 30000
});

function stripTags(s) {
  return String(s || '').replace(/<!--[\\s\\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
}

const KOREAN_STATUS_MAP = [
  { keywords: ['사용완료'], status: 'VISA USED' },
  { keywords: ['불허'], status: 'REJECTED' },
  { keywords: ['허가', '발급'], status: 'APPROVED' },
  { keywords: ['접수', '신청'], status: 'RECEIVED' },
  { keywords: ['심사중', '처리중', '심사 중', '처리 중'], status: 'UNDER REVIEW' },
  { keywords: ['취소'], status: 'CANCELLED' },
  { keywords: ['반려'], status: 'RETURNED' },
  { keywords: ['보완완료', '보완제출', '보완접수'], status: 'SUPPLEMENT SUBMITTED' },
  { keywords: ['보완요청', '보완요구', '보완'], status: 'SUPPLEMENT NEEDED' },
  { keywords: ['기한만료'], status: 'EXPIRED' }
];

function parseKoreanStatus(korean) {
  if (!korean) return 'UNKNOWN';
  for (const entry of KOREAN_STATUS_MAP) {
    if (entry.keywords.some(k => korean.includes(k))) return entry.status;
  }
  return korean;
}

function parseResult(html, visaType) {
  const isEVisa = visaType === 'E-Visa' || visaType === 'Regional';
  const statusRegex = isEVisa ? /id="PROC_STS_CDNM"[^>]*>([\\s\\S]*?)<\\/div>/g : /id="PROC_STS_CDNM_1"[^>]*>([\\s\\S]*?)<\\/div>/g;
  const statusMatches = [...html.matchAll(statusRegex)];
  const statuses = statusMatches.map(m => stripTags(m[1]).trim());
  const latestRaw = statuses[0] || '';
  const parsedStatus = parseKoreanStatus(latestRaw);

  const dateMatches = isEVisa 
    ? [...html.matchAll(/id="APPL_YMD"[^>]*>([^<]+)</g)].map(m => m[1].trim())
    : [...html.matchAll(/id="RECPT_YMD"[^>]*>([^<]+)</g)].map(m => m[1].trim());

  return {
    found: statuses.length > 0,
    rawStatus: latestRaw,
    status: parsedStatus,
    applicationDate: dateMatches[0] || 'N/A'
  };
}

async function sendVisaCheck(student, customAgent) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    let dnsMs = 0, tcpMs = 0, tlsMs = 0, ttfbMs = 0;

    const passport = student.passport.toUpperCase().trim();
    const fullName = (student.fullName || student.fullname || '').toUpperCase().trim();
    const birthday = (student.birthday || '').trim();
    const visaType = (student.visaType || student.visa_type || 'Embassy').trim();
    const applicationNo = (student.applicationNo || student.application_no || '').trim();

    let bodyParams;
    if (visaType === 'E-Visa' && applicationNo) {
      bodyParams = {
        pRADIOSEARCH: 'gb01',
        sINVITEE_SEQ: applicationNo,
        ssINVITEE_SEQ: applicationNo,
        sPASS_NO: passport,
        sEK_NM: fullName,
        sFROMDATE: birthday,
        sMainPopUpGB: 'main'
      };
    } else {
      bodyParams = {
        pRADIOSEARCH: 'gb03',
        sBUSI_GB: 'PASS_NO',
        sBUSI_GBNO: passport,
        ssBUSI_GBNO: passport,
        sEK_NM: fullName,
        sFROMDATE: birthday,
        sMainPopUpGB: 'main'
      };
    }

    const body = querystring.stringify(bodyParams);

    const req = https.request({
      hostname: 'www.visa.go.kr',
      port: 443,
      path: '/openPage.do?MENU_ID=10301',
      method: 'POST',
      family: 4,
      agent: customAgent,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.visa.go.kr/openPage.do?MENU_ID=10301',
        'Origin': 'https://www.visa.go.kr',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(Buffer.byteLength(body))
      }
    }, (res) => {
      ttfbMs = performance.now() - start;
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const totalMs = performance.now() - start;
        const html = Buffer.concat(chunks).toString('utf8');
        const parsed = parseResult(html, visaType);

        resolve({
          statusCode: res.statusCode,
          dnsMs: Math.round(dnsMs),
          tcpMs: Math.round(tcpMs),
          tlsMs: Math.round(tlsMs),
          ttfbMs: Math.round(ttfbMs),
          totalMs: Math.round(totalMs),
          htmlBytes: html.length,
          parsed
        });
      });
    });

    req.on('socket', (socket) => {
      socket.on('lookup', () => { dnsMs = performance.now() - start; });
      socket.on('connect', () => { tcpMs = performance.now() - start; });
      socket.on('secureConnect', () => { tlsMs = performance.now() - start; });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.write(body);
    req.end();
  });
}

async function run() {
  try {
    const client = await pool.connect();
    console.log('1. Fetching a real student from PostgreSQL database on VPS...');
    const res = await client.query('SELECT passport, "fullName", birthday, "visaType", "applicationNo", status, "applicationDate" FROM students WHERE "deletedAt" IS NULL AND "fullName" IS NOT NULL AND birthday IS NOT NULL AND status != \\'Pending\\' LIMIT 1');
    client.release();
    await pool.end();

    if (res.rows.length === 0) {
      console.error('No students found in database!');
      return;
    }

    const student = res.rows[0];
    console.log('   Selected Student: ' + student.fullName + ' | Passport: ' + student.passport.slice(0, 3) + '****' + student.passport.slice(-2) + ' | DOB: ' + student.birthday + ' | Type: ' + student.visaType);
    console.log('   Current Database Status: ' + student.status + ' | App Date: ' + student.applicationDate);

    console.log('\\n2. Testing COLD HTTPS Connection (New TCP + TLS Handshake)...');
    const coldAgent = new https.Agent({ keepAlive: false, family: 4 });
    const coldResult = await sendVisaCheck(student, coldAgent);
    console.log('   [Cold Result]:', JSON.stringify(coldResult, null, 2));

    console.log('\\n3. Testing WARM / Keep-Alive HTTPS Connection (Reused SSL Socket)...');
    // Pre-warm socket on visaAgent
    await sendVisaCheck(student, visaAgent);
    // Measured Warm check
    const warmResult = await sendVisaCheck(student, visaAgent);
    console.log('   [Warm Result]:', JSON.stringify(warmResult, null, 2));

  } catch (err) {
    console.error('Error during test:', err);
  }
}

run();
EOF
`;

console.log('Connecting to VPS (178.238.231.210) to run real student live check...');

conn.on('ready', () => {
  conn.exec(remoteScript, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => {
      conn.end();
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection error:', err.message);
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
