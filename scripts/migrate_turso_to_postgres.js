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

const USERS_STUDENTS_DDL = [
  // 1. Users
  `DROP TABLE IF EXISTS students CASCADE;`,
  `DROP TABLE IF EXISTS users CASCADE;`,
  `CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    telegram_id BIGINT,
    telegram_username TEXT,
    first_name TEXT,
    last_name TEXT,
    encrypted_password TEXT,
    session TEXT,
    cookies TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    students_count INTEGER DEFAULT 0
  );`,

  // 2. Students
  `CREATE TABLE students (
    "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    passport TEXT NOT NULL,
    "fullName" TEXT,
    birthday TEXT,
    "studentId" TEXT,
    status TEXT,
    "applicationDate" TEXT,
    "lastChecked" TEXT,
    "rejectReason" TEXT,
    "pdfUrl" TEXT,
    "apiResponse" TEXT,
    "batchSelected" INTEGER DEFAULT 0,
    "batchSelectedUpdatedAt" TEXT,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP,
    "visaType" TEXT DEFAULT 'Embassy',
    "applicationNo" TEXT DEFAULT '',
    "deletedAt" TEXT,
    telegram_user_id BIGINT,
    student_id TEXT,
    application_no TEXT,
    visa_type TEXT,
    application_date TEXT,
    last_checked TEXT,
    pinned INTEGER DEFAULT 0,
    tariff TEXT,
    university TEXT,
    coordinator TEXT,
    b2b TEXT,
    check_source TEXT,
    "checkSource" TEXT,
    PRIMARY KEY ("userId", passport)
  );`
];

async function migrateTable(tableName, client, pgClient) {
  console.log(`\n========================================`);
  console.log(`Migrating table: "${tableName}"`);
  console.log(`========================================`);

  // 1. Get Turso count
  const countRes = await client.execute(`SELECT count(*) as c FROM "${tableName}"`);
  const totalRows = Number(countRes.rows[0].c);
  console.log(`Turso row count: ${totalRows}`);

  if (totalRows === 0) {
    console.log(`Table "${tableName}" is empty. Skipping rows copy.`);
    return { table: tableName, tursoCount: 0, pgCount: 0, status: 'SUCCESS ✅' };
  }

  // 2. Fetch all data in batches
  const batchSize = 500;
  let offset = 0;
  let inserted = 0;

  while (offset < totalRows) {
    const dataRes = await client.execute(`SELECT * FROM "${tableName}" LIMIT ${batchSize} OFFSET ${offset}`);
    const rows = dataRes.rows;
    if (!rows || rows.length === 0) break;

    const columns = dataRes.columns;
    const quotedColumns = columns.map(c => `"${c}"`).join(', ');

    // Build parameterized insert query for the batch
    for (const row of rows) {
      const values = columns.map(col => row[col]);
      const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

      const query = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      await pgClient.query(query, values);
      inserted++;
    }

    offset += rows.length;
    process.stdout.write(`\rTransferred: ${inserted} / ${totalRows} (${Math.round((inserted / totalRows) * 100)}%)`);
  }
  console.log('');

  // 3. Reset serial sequences for tables with auto-increment 'id'
  try {
    const seqRes = await pgClient.query(`
      SELECT pg_get_serial_sequence('"${tableName}"', 'id') as seq_name
    `);
    const seqName = seqRes.rows[0]?.seq_name;
    if (seqName) {
      await pgClient.query(`SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM "${tableName}"), 1), true)`);
      console.log(`Sequence reset for ${tableName}.id`);
    }
  } catch (err) {
    // Ignore if table has no serial id
  }

  // 4. Verify PostgreSQL count
  const pgCountRes = await pgClient.query(`SELECT count(*) as c FROM "${tableName}"`);
  const pgCount = Number(pgCountRes.rows[0].c);
  console.log(`Verification: Turso=${totalRows} | PostgreSQL=${pgCount}`);

  return {
    table: tableName,
    tursoCount: totalRows,
    pgCount,
    status: totalRows === pgCount ? 'SUCCESS ✅' : 'MISMATCH ⚠️'
  };
}

async function main() {
  console.log('🚀 Fixing users and students tables schema and migrating...\n');
  const pgClient = await pgPool.connect();

  try {
    for (const ddl of USERS_STUDENTS_DDL) {
      await pgClient.query(ddl);
    }
    console.log('✅ Users and Students schemas updated successfully!\n');

    const results = [];
    for (const table of ['users', 'students']) {
      const res = await migrateTable(table, turso, pgClient);
      results.push(res);
    }

    console.log('\n=============================================================');
    console.log('              FINAL USERS & STUDENTS MIGRATION               ');
    console.log('=============================================================');
    console.table(results);
  } finally {
    pgClient.release();
    await pgPool.end();
  }
}

main().catch(console.error);
