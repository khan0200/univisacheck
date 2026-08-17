import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import { transformSql } from './server/utils/turso.ts';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });

async function main() {
  const sql = "UPDATE students SET batchSelected = ?, batchSelectedUpdatedAt = ? WHERE passport = ? AND userId = ?";
  const transformed = transformSql(sql);
  console.log('Transformed SQL:', transformed);

  const res = await pool.query(transformed, [1, new Date().toISOString(), 'FB2440210', 1]);
  console.log('Update result rowCount:', res.rowCount);

  const check = await pool.query('SELECT passport, "batchSelected", "batchSelectedUpdatedAt" FROM students WHERE passport = $1 AND "userId" = $2', ['FB2440210', 1]);
  console.log('Verified row:', check.rows[0]);

  await pool.end();
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
