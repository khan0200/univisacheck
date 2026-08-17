import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import { execSync } from 'child_process';

console.log('=== Checking Netstat / ss for 5432 ===');
try {
  console.log(execSync('ss -tulpn | grep 5432').toString());
} catch (e) {
  console.log('ss error:', e.message);
}

console.log('=== Checking iptables ===');
try {
  console.log(execSync('iptables -L INPUT -n -v | grep 5432 || true').toString());
} catch (e) {
  console.log('iptables error:', e.message);
}

console.log('=== Checking aaPanel / bt firewall ===');
try {
  execSync('iptables -I INPUT -p tcp --dport 5432 -j ACCEPT');
  console.log('Added iptables ACCEPT rule for 5432');
} catch (e) {
  console.log('iptables add error:', e.message);
}
`;

conn.on('ready', () => {
  conn.exec(`export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH && node --input-type=module << 'EOF'
${scriptContent}
EOF
`, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '178.238.231.210', port: 22, username: 'root', password: 'SalomKorea2026!' });
