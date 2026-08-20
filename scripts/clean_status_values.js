import fs from 'fs';
import { createClient } from '@libsql/client';
import { Client as SshClient } from 'ssh2';

const env = fs.readFileSync('./nuxt-app/.env', 'utf8');
const envVars = Object.fromEntries(env.split('\n').filter(l => l.includes('=')).map(l => {
  const idx = l.indexOf('=');
  return [l.slice(0, idx).trim(), l.slice(idx+1).trim().replace(/^['"]|['"]$/g, '')];
}));

const db = createClient({
  url: envVars.TURSO_DATABASE_URL,
  authToken: envVars.TURSO_AUTH_TOKEN
});

async function cleanTurso() {
  console.log('--- Cleaning Turso Statuses ---');
  await db.execute("UPDATE students SET status = 'UNDER REVIEW' WHERE status IN ('UNDER_REVIEW', 'under_review', 'Under_review')");
  await db.execute("UPDATE students SET \"lastNotifiedStatus\" = 'UNDER REVIEW' WHERE \"lastNotifiedStatus\" IN ('UNDER_REVIEW', 'under_review', 'Under_review')");
  await db.execute("UPDATE students SET last_notified_status = 'UNDER REVIEW' WHERE last_notified_status IN ('UNDER_REVIEW', 'under_review', 'Under_review')");

  await db.execute("UPDATE students SET status = 'SUPPLEMENT NEEDED' WHERE status IN ('SUPPLEMENT_NEEDED', 'supplement_needed')");
  await db.execute("UPDATE students SET \"lastNotifiedStatus\" = 'SUPPLEMENT NEEDED' WHERE \"lastNotifiedStatus\" IN ('SUPPLEMENT_NEEDED', 'supplement_needed')");
  await db.execute("UPDATE students SET last_notified_status = 'SUPPLEMENT NEEDED' WHERE last_notified_status IN ('SUPPLEMENT_NEEDED', 'supplement_needed')");

  const res = await db.execute("SELECT DISTINCT status FROM students");
  console.log('Turso distinct statuses:', res.rows);
}

function cleanPostgres() {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const cmd = `sudo -u postgres psql -d salomkorea_db -c "
      UPDATE students SET status = 'UNDER REVIEW' WHERE status IN ('UNDER_REVIEW', 'under_review', 'Under_review');
      UPDATE students SET \\"lastNotifiedStatus\\" = 'UNDER REVIEW' WHERE \\"lastNotifiedStatus\\" IN ('UNDER_REVIEW', 'under_review', 'Under_review');
      UPDATE students SET last_notified_status = 'UNDER REVIEW' WHERE last_notified_status IN ('UNDER_REVIEW', 'under_review', 'Under_review');
      UPDATE students SET status = 'SUPPLEMENT NEEDED' WHERE status IN ('SUPPLEMENT_NEEDED', 'supplement_needed');
      UPDATE students SET \\"lastNotifiedStatus\\" = 'SUPPLEMENT NEEDED' WHERE \\"lastNotifiedStatus\\" IN ('SUPPLEMENT_NEEDED', 'supplement_needed');
      UPDATE students SET last_notified_status = 'SUPPLEMENT NEEDED' WHERE last_notified_status IN ('SUPPLEMENT_NEEDED', 'supplement_needed');
      SELECT DISTINCT status FROM students;
    "`;
    conn.on('ready', () => {
      console.log('--- Cleaning Postgres on VPS ---');
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', () => {
          conn.end();
          resolve();
        });
      });
    }).on('error', reject).connect({
      host: '178.238.231.210',
      port: 22,
      username: 'root',
      password: 'SalomKorea2026!'
    });
  });
}

async function main() {
  await cleanTurso();
  await cleanPostgres();
  console.log('✅ Status cleanup complete on all databases!');
}

main().catch(console.error);
