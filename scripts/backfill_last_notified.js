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

async function backfillTurso() {
  console.log('Backfilling Turso last_notified_status for all students...');
  const res = await db.execute(`
    UPDATE students
    SET last_notified_status = status,
        lastNotifiedStatus = status
    WHERE status IS NOT NULL AND (last_notified_status IS NULL OR lastNotifiedStatus IS NULL)
  `);
  console.log('Turso rows updated:', res.rowsAffected);
}

function backfillPostgres() {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const cmd = `sudo -u postgres psql -d salomkorea_db -c "
      UPDATE students
      SET last_notified_status = status,
          \\"lastNotifiedStatus\\" = status
      WHERE status IS NOT NULL AND (last_notified_status IS NULL OR \\"lastNotifiedStatus\\" IS NULL);
    "`;
    conn.on('ready', () => {
      console.log('Backfilling Postgres on VPS...');
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
  await backfillTurso();
  await backfillPostgres();
  console.log('✅ Backfill complete for all students!');
}

main().catch(console.error);
