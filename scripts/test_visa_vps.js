import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import { checkStudentVisaStatus } from './server/lib/visa.ts';

async function main() {
  console.log('Testing direct check for FA8686092 on VPS...');
  try {
    const res = await checkStudentVisaStatus('FA8686092', 'MUKHAMMADKHON ABDURASHIDOV', '2000-01-01', 'Embassy', '');
    console.log('Direct check result:', res);
  } catch (err) {
    console.error('Direct check error:', err);
  }
}

main().catch(console.error);
`;

conn.on('ready', () => {
  conn.exec(`export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH && cd /www/wwwroot/salomkorea/nuxt-app && npx tsx << 'EOF'
${scriptContent}
EOF
`, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '178.238.231.210', port: 22, username: 'root', password: 'SalomKorea2026!' });
