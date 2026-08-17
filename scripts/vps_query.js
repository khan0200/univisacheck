import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });

async function main() {
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  for (const row of tables.rows) {
    const c = await pool.query('SELECT count(*) as count FROM "' + row.table_name + '"');
    console.log(row.table_name + ': ' + c.rows[0].count);
  }
  await pool.end();
}
main().catch(console.error);
`;

conn.on('ready', () => {
  conn.exec(`export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH && cd /www/wwwroot/salomkorea/nuxt-app && node --input-type=module << 'EOF'
${scriptContent}
EOF
`, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '178.238.231.210', port: 22, username: 'root', password: 'SalomKorea2026!' });
