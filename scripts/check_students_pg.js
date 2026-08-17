import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });

async function main() {
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='students'");
  console.log('Students columns in Postgres:');
  console.table(cols.rows);

  const sample = await pool.query('SELECT * FROM students LIMIT 5');
  console.log('Students sample rows count:', sample.rows.length);
  console.log('Sample row:', sample.rows[0]);

  const userIds = await pool.query('SELECT DISTINCT "userId", count(*) FROM students GROUP BY "userId"');
  console.log('Students by userId:');
  console.table(userIds.rows);

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
