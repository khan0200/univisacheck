import https from 'https';

const req = https.get('https://www.visa.go.kr/openPage.do?MENU_ID=10301', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  },
  timeout: 10000
}, (res) => {
  console.log('✅ Connected to visa.go.kr! HTTP Status:', res.statusCode);
  process.exit(0);
});

req.on('error', (err) => {
  console.error('❌ Connection error:', err.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Timed out after 10s');
  req.destroy();
  process.exit(1);
});
