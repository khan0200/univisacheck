import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import { execSync } from 'child_process';
import fs from 'fs';

const confPath = '/etc/postgresql/16/main/postgresql.conf';
let conf = fs.readFileSync(confPath, 'utf8');

// Replace any listen_addresses line
conf = conf.replace(/^#?\\s*listen_addresses\\s*=.*$/m, "listen_addresses = '*'");
// Or append if not found
if (!conf.includes("listen_addresses = '*'")) {
  conf += "\\nlisten_addresses = '*'\\n";
}

fs.writeFileSync(confPath, conf);
console.log('Saved postgresql.conf with listen_addresses = *');

execSync('systemctl restart postgresql');
console.log('Restarted postgresql');
console.log(execSync('ss -tulpn | grep 5432').toString());
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
