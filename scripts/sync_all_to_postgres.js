import { Client } from 'ssh2';
import { createClient } from '@libsql/client';

const turso = createClient({
  url: 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg'
});

const conn = new Client();

async function main() {
  console.log('Fetching users and students from Turso...');
  const tursoUsers = await turso.execute('SELECT * FROM users ORDER BY id');
  const tursoStudents = await turso.execute('SELECT * FROM students');
  console.log(`Turso: ${tursoUsers.rows.length} users, ${tursoStudents.rows.length} students`);

  const syncScript = `
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });

const usersData = ${JSON.stringify(tursoUsers.rows)};
const studentsData = ${JSON.stringify(tursoStudents.rows)};

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting sync into PostgreSQL...');
    
    // 1. Sync users
    for (const u of usersData) {
      const query = \`
        INSERT INTO users (id, email, username, password, "createdAt", telegram_id, telegram_username, first_name, last_name, encrypted_password, session, cookies, updated_at, students_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          username = EXCLUDED.username,
          telegram_id = EXCLUDED.telegram_id,
          telegram_username = EXCLUDED.telegram_username,
          students_count = EXCLUDED.students_count
      \`;
      await client.query(query, [
        u.id, u.email, u.username, u.password, u.createdAt || new Date().toISOString(),
        u.telegram_id || null, u.telegram_username || null, u.first_name || null, u.last_name || null,
        u.encrypted_password || null, u.session || null, u.cookies || null,
        u.updated_at || new Date().toISOString(), u.students_count || 0
      ]);
    }
    console.log('✅ Users synced to PostgreSQL');

    // Reset users id sequence
    await client.query(\`SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true)\`);

    // 2. Sync students
    let insertedStudents = 0;
    for (const s of studentsData) {
      const query = \`
        INSERT INTO students (
          "userId", passport, "fullName", birthday, "studentId", status,
          "applicationDate", "lastChecked", "rejectReason", "pdfUrl", "apiResponse",
          "batchSelected", "batchSelectedUpdatedAt", "createdAt", "visaType", "applicationNo",
          "deletedAt", telegram_user_id, student_id, application_no, visa_type,
          application_date, last_checked, pinned, tariff, university, coordinator, b2b,
          check_source, "checkSource"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26, $27, $28,
          $29, $30
        )
        ON CONFLICT ("userId", passport) DO UPDATE SET
          "fullName" = EXCLUDED."fullName",
          birthday = EXCLUDED.birthday,
          "studentId" = EXCLUDED."studentId",
          status = EXCLUDED.status,
          "applicationDate" = EXCLUDED."applicationDate",
          "lastChecked" = EXCLUDED."lastChecked",
          "rejectReason" = EXCLUDED."rejectReason",
          "pdfUrl" = EXCLUDED."pdfUrl",
          "apiResponse" = EXCLUDED."apiResponse",
          "batchSelected" = EXCLUDED."batchSelected",
          "batchSelectedUpdatedAt" = EXCLUDED."batchSelectedUpdatedAt",
          "visaType" = EXCLUDED."visaType",
          "applicationNo" = EXCLUDED."applicationNo",
          "deletedAt" = EXCLUDED."deletedAt",
          pinned = EXCLUDED.pinned,
          tariff = EXCLUDED.tariff,
          university = EXCLUDED.university,
          coordinator = EXCLUDED.coordinator,
          b2b = EXCLUDED.b2b,
          check_source = EXCLUDED.check_source,
          "checkSource" = EXCLUDED."checkSource"
      \`;
      await client.query(query, [
        s.userId, s.passport, s.fullName, s.birthday, s.studentId, s.status,
        s.applicationDate, s.lastChecked, s.rejectReason, s.pdfUrl, s.apiResponse,
        s.batchSelected || 0, s.batchSelectedUpdatedAt || null, s.createdAt || new Date().toISOString(), s.visaType || 'Embassy', s.applicationNo || '',
        s.deletedAt || null, s.telegram_user_id || null, s.student_id || null, s.application_no || null, s.visa_type || null,
        s.application_date || null, s.last_checked || null, s.pinned || 0, s.tariff || null, s.university || null, s.coordinator || null, s.b2b || null,
        s.check_source || 'manual', s.checkSource || 'manual'
      ]);
      insertedStudents++;
    }
    console.log(\`✅ Students synced to PostgreSQL: \${insertedStudents}\`);

    // Verify
    const userCount = await client.query('SELECT count(*) as c FROM users');
    const studentCount = await client.query('SELECT count(*) as c FROM students');
    const unibridgeStudents = await client.query('SELECT count(*) as c FROM students WHERE "userId" = 1 AND "deletedAt" IS NULL');
    console.log(\`Final counts in PostgreSQL: Users=\${userCount.rows[0].c}, Students=\${studentCount.rows[0].c}, Unibridge Active=\${unibridgeStudents.rows[0].c}\`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
`;

  conn.on('ready', () => {
    conn.exec(`export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH && cd /www/wwwroot/salomkorea/nuxt-app && node --input-type=module << 'EOF'
${syncScript}
EOF
`, (err, stream) => {
      if (err) throw err;
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', () => conn.end());
    });
  }).connect({ host: '178.238.231.210', port: 22, username: 'root', password: 'SalomKorea2026!' });
}

main().catch(console.error);
