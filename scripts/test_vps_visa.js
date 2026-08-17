import https from 'node:https';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const start = Date.now();
const req = https.get('https://www.visa.go.kr/openPage.do?MENU_ID=10301', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  },
  family: 4,
  timeout: 15000
}, (res) => {
  console.log(`✅ Connected to visa.go.kr in ${Date.now() - start}ms! HTTP Status: ${res.statusCode}`);
  const cookies = res.headers['set-cookie'];
  console.log('Cookies:', cookies);
  res.resume();
  res.on('end', () => {
    console.log('Response finished successfully.');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error(`❌ Connection error after ${Date.now() - start}ms:`, err.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error(`❌ Timed out after ${Date.now() - start}ms`);
  req.destroy();
  process.exit(1);
});

