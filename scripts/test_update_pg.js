import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });

async function main() {
  // Test updating batchSelected with unquoted vs quoted
  try {
    const unquotedSql = "UPDATE students SET batchSelected = 1, batchSelectedUpdatedAt = NOW() WHERE userId = 1 AND passport = 'FB2440210'";
    await pool.query(unquotedSql);
    console.log('Unquoted update batchSelected succeeded!');
  } catch (err) {
    console.error('❌ Unquoted update batchSelected failed:', err.message);
  }

  try {
    const quotedSql = 'UPDATE students SET "batchSelected" = 1, "batchSelectedUpdatedAt" = NOW() WHERE "userId" = 1 AND passport = \\'FB2440210\\'';
    await pool.query(quotedSql);
    console.log('✅ Quoted update batchSelected succeeded!');
  } catch (err) {
    console.error('❌ Quoted update batchSelected failed:', err.message);
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
