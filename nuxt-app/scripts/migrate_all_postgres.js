import { createClient } from '@libsql/client';
import pg from 'pg';
const { Pool } = pg;

const turso = createClient({
  url: 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg'
});

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'
});

async function main() {
  console.log('🚀 Starting Full Migration from Turso to PostgreSQL...');
  const pgClient = await pgPool.connect();

  try {
    // 1. Fetch all users from Turso
    const tursoUsers = await turso.execute('SELECT * FROM users ORDER BY id');
    console.log(`Turso Users count: ${tursoUsers.rows.length}`);

    for (const u of tursoUsers.rows) {
      const q = `
        INSERT INTO users (id, email, username, password, "createdAt", telegram_id, telegram_username, first_name, last_name, encrypted_password, session, cookies, updated_at, students_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          username = EXCLUDED.username,
          password = EXCLUDED.password,
          "createdAt" = EXCLUDED."createdAt",
          telegram_id = EXCLUDED.telegram_id,
          telegram_username = EXCLUDED.telegram_username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          encrypted_password = EXCLUDED.encrypted_password,
          session = EXCLUDED.session,
          cookies = EXCLUDED.cookies,
          updated_at = EXCLUDED.updated_at,
          students_count = EXCLUDED.students_count
      `;
      await pgClient.query(q, [
        u.id, u.email, u.username, u.password, u.createdAt || new Date().toISOString(),
        u.telegram_id || null, u.telegram_username || null, u.first_name || null, u.last_name || null,
        u.encrypted_password || null, u.session || null, u.cookies || null,
        u.updated_at || new Date().toISOString(), u.students_count || 0
      ]);
    }
    console.log('✅ All Users migrated into PostgreSQL.');

    // 2. Fetch all students from Turso
    const tursoStudents = await turso.execute('SELECT * FROM students');
    console.log(`Turso Students count: ${tursoStudents.rows.length}`);

    let studentCount = 0;
    for (const s of tursoStudents.rows) {
      const q = `
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
      `;
      await pgClient.query(q, [
        s.userId, s.passport, s.fullName, s.birthday, s.studentId, s.status,
        s.applicationDate, s.lastChecked, s.rejectReason, s.pdfUrl, s.apiResponse,
        s.batchSelected || 0, s.batchSelectedUpdatedAt || null, s.createdAt || new Date().toISOString(), s.visaType || 'Embassy', s.applicationNo || '',
        s.deletedAt || null, s.telegram_user_id || null, s.student_id || null, s.application_no || null, s.visa_type || null,
        s.application_date || null, s.last_checked || null, s.pinned || 0, s.tariff || null, s.university || null, s.coordinator || null, s.b2b || null,
        s.check_source || 'manual', s.checkSource || 'manual'
      ]);
      studentCount++;
    }
    console.log(`✅ All Students migrated into PostgreSQL: ${studentCount}`);

    // 3. Reset sequences
    try {
      await pgClient.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true)`);
    } catch {}

    // 4. Counts check
    const uCount = await pgClient.query('SELECT count(*) as c FROM users');
    const sCount = await pgClient.query('SELECT count(*) as c FROM students');
    console.log(`\n🎉 Verification: Users=${uCount.rows[0].c} | Students=${sCount.rows[0].c}`);

  } finally {
    pgClient.release();
    await pgPool.end();
  }
}

main().catch(console.error);
