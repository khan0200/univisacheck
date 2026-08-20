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

async function syncTurso() {
  console.log('Syncing Turso DB for FA0135684...');
  await db.execute({
    sql: 'UPDATE students SET status = \'UNDER_REVIEW\', "lastNotifiedStatus" = \'UNDER_REVIEW\', last_notified_status = \'UNDER_REVIEW\' WHERE passport = ?',
    args: ['FA0135684']
  });
  const res = await db.execute({
    sql: 'SELECT passport, status, "lastNotifiedStatus", last_notified_status FROM students WHERE passport = ?',
    args: ['FA0135684']
  });
  console.log('Turso DB result:', res.rows);
}

function syncPostgres() {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const cmd = `sudo -u postgres psql -d salomkorea_db -c "UPDATE students SET status = 'UNDER_REVIEW', \\"lastNotifiedStatus\\" = 'UNDER_REVIEW', last_notified_status = 'UNDER_REVIEW' WHERE passport = 'FA0135684'; SELECT passport, status, \\"lastNotifiedStatus\\", last_notified_status FROM students WHERE passport = 'FA0135684';"`;
    conn.on('ready', () => {
      console.log('Syncing Postgres on VPS...');
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
  await syncTurso();
  await syncPostgres();
  console.log('✅ Synchronization complete!');
}

main().catch(console.error);
