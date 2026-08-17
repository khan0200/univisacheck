import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import { execSync } from 'child_process';
import fs from 'fs';

console.log('--- Configuring VPS PostgreSQL for Remote Connections ---');

// 1. Find postgresql.conf and pg_hba.conf
const pgConfPath = execSync('sudo -u postgres psql -t -P format=unaligned -c "SHOW config_file;"').toString().trim();
const hbaConfPath = execSync('sudo -u postgres psql -t -P format=unaligned -c "SHOW hba_file;"').toString().trim();
console.log('postgresql.conf:', pgConfPath);
console.log('pg_hba.conf:', hbaConfPath);

// 2. Enable listen_addresses = '*'
let pgConf = fs.readFileSync(pgConfPath, 'utf8');
if (!pgConf.includes("listen_addresses = '*'")) {
  pgConf = pgConf.replace(/#?listen_addresses\s*=\s*'[^']*'/, "listen_addresses = '*'");
  fs.writeFileSync(pgConfPath, pgConf);
  console.log('Updated listen_addresses to *');
} else {
  console.log('listen_addresses already *');
}

// 3. Add remote access rule to pg_hba.conf
let hbaConf = fs.readFileSync(hbaConfPath, 'utf8');
const rule = 'host    salomkorea_db   salomkorea_user 0.0.0.0/0               scram-sha-256';
const ruleMd5 = 'host    salomkorea_db   salomkorea_user 0.0.0.0/0               md5';
if (!hbaConf.includes('salomkorea_db') || !hbaConf.includes('0.0.0.0/0')) {
  hbaConf += \`\\n# Remote access for salomkorea_user\\n\${rule}\\n\${ruleMd5}\\n\`;
  fs.writeFileSync(hbaConfPath, hbaConf);
  console.log('Added remote rule to pg_hba.conf');
} else {
  console.log('pg_hba.conf already has remote rule');
}

// 4. Restart PostgreSQL
console.log('Restarting postgresql service...');
execSync('systemctl restart postgresql');
console.log('PostgreSQL restarted successfully.');

// 5. Open port 5432 in firewall
try {
  execSync('ufw allow 5432/tcp');
  console.log('UFW: allowed port 5432/tcp');
} catch (e) {
  console.log('UFW note:', e.message);
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
