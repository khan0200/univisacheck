import { Client } from 'ssh2';

const conn = new Client();

const testScript = `
echo "========================================================"
echo " 🌐 VPS -> VISA.GO.KR NETWORK LATENCY & BENCHMARK TEST "
echo "========================================================"

echo ""
echo "--- 1. DNS Resolution (IPv4 vs IPv6) ---"
time nslookup www.visa.go.kr

echo ""
echo "--- 2. Ping / ICMP RTT (5 packets) ---"
ping -c 5 www.visa.go.kr || ping -c 5 visa.go.kr || echo "ICMP ping may be blocked by government firewall"

echo ""
echo "--- 3. Detailed Curl HTTPS Latency Breakdown (GET) ---"
for i in {1..3}; do
  echo ">>> Attempt $i:"
  curl -w "
  DNS Lookup Time:   %{time_namelookup}s
  TCP Connect Time:  %{time_connect}s
  TLS Handshake:     %{time_appconnect}s
  Pre-transfer Time: %{time_pretransfer}s
  Time to First Byte (TTFB): %{time_starttransfer}s
  Total Time:        %{time_total}s
  HTTP Status:       %{http_code}
  Remote IP:         %{remote_ip}
" -o /dev/null -s -k "https://www.visa.go.kr/openPage.do?MENU_ID=10301"
  sleep 1
done

export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH
echo ""
echo "--- 4. Node.js Live HTTPS Check Benchmark (POST simulation) ---"
node -e '
const https = require("https");
const querystring = require("querystring");

async function testCheck(i) {
  return new Promise((resolve) => {
    const start = performance.now();
    let dnsMs = 0, tcpMs = 0, tlsMs = 0, ttfbMs = 0;

    const body = querystring.stringify({
      pRADIOSEARCH: "gb03",
      sBUSI_GB: "PASS_NO",
      sBUSI_GBNO: "FA1234567",
      ssBUSI_GBNO: "FA1234567",
      sEK_NM: "TEST STUDENT",
      sFROMDATE: "2000-01-01",
      sMainPopUpGB: "main"
    });

    const req = https.request({
      hostname: "www.visa.go.kr",
      port: 443,
      path: "/openPage.do?MENU_ID=10301",
      method: "POST",
      family: 4,
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.visa.go.kr/openPage.do?MENU_ID=10301",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(Buffer.byteLength(body))
      }
    }, (res) => {
      ttfbMs = performance.now() - start;
      let totalBytes = 0;
      res.on("data", c => { totalBytes += c.length; });
      res.on("end", () => {
        const totalMs = performance.now() - start;
        console.log(\`[POST Test \${i}] Status: \${res.statusCode} | TCP: \${Math.round(tcpMs)}ms | TLS: \${Math.round(tlsMs)}ms | TTFB: \${Math.round(ttfbMs)}ms | Total: \${Math.round(totalMs)}ms | Bytes: \${totalBytes}\`);
        resolve();
      });
    });

    req.on("socket", (socket) => {
      socket.on("lookup", () => { dnsMs = performance.now() - start; });
      socket.on("connect", () => { tcpMs = performance.now() - start; });
      socket.on("secureConnect", () => { tlsMs = performance.now() - start; });
    });

    req.on("error", (err) => {
      console.log(\`[POST Test \${i}] Error: \${err.message}\`);
      resolve();
    });

    req.write(body);
    req.end();
  });
}

(async () => {
  for (let i = 1; i <= 3; i++) {
    await testCheck(i);
    await new Promise(r => setTimeout(r, 800));
  }
})();
'
`;

console.log('Connecting to VPS (178.238.231.210) to run latency diagnostics...');

conn.on('ready', () => {
  console.log('Connected! Executing network tests on VPS...\n');
  conn.exec(testScript, (err, stream) => {
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
