import { Client } from 'ssh2';

const conn = new Client();

const scriptContent = `
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });

async function main() {
  try {
    const rawSql = "SELECT passport, fullName, birthday, studentId, status, applicationDate, lastChecked, rejectReason, pdfUrl, batchSelected, batchSelectedUpdatedAt, createdAt, userId, visaType, applicationNo, pinned, tariff, university, coordinator, b2b, check_source, checkSource, apiResponse FROM students WHERE userId = $1 AND deletedAt IS NULL ORDER BY createdAt DESC";
    const res = await pool.query(rawSql, [1]);
    console.log('Unquoted query succeeded! Rows:', res.rows.length);
  } catch (err) {
    console.error('❌ Unquoted query failed:', err.message);
  }

  try {
    const quotedSql = 'SELECT passport, "fullName", birthday, "studentId", status, "applicationDate", "lastChecked", "rejectReason", "pdfUrl", "batchSelected", "batchSelectedUpdatedAt", "createdAt", "userId", "visaType", "applicationNo", pinned, tariff, university, coordinator, b2b, check_source, "checkSource", "apiResponse" FROM students WHERE "userId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC';
    const res2 = await pool.query(quotedSql, [1]);
    console.log('✅ Quoted query succeeded! Rows:', res2.rows.length);
  } catch (err) {
    console.error('❌ Quoted query failed:', err.message);
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
