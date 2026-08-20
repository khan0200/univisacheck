import fs from 'fs';
import { createClient } from '@libsql/client';

const env = fs.readFileSync('./nuxt-app/.env', 'utf8');
const envVars = Object.fromEntries(env.split('\n').filter(l => l.includes('=')).map(l => {
  const idx = l.indexOf('=');
  return [l.slice(0, idx).trim(), l.slice(idx+1).trim().replace(/^['"]|['"]$/g, '')];
}));

const db = createClient({
  url: envVars.TURSO_DATABASE_URL,
  authToken: envVars.TURSO_AUTH_TOKEN
});

async function main() {
  const info = await db.execute('PRAGMA table_info(students)');
  console.log('Turso students table columns:', info.rows.map(r => r.name));

  try {
    await db.execute('ALTER TABLE students ADD COLUMN last_notified_status TEXT');
    console.log('Added last_notified_status');
  } catch (e) {
    console.log('last_notified_status exists or error:', e.message);
  }

  try {
    await db.execute('ALTER TABLE students ADD COLUMN lastNotifiedStatus TEXT');
    console.log('Added lastNotifiedStatus');
  } catch (e) {
    console.log('lastNotifiedStatus exists or error:', e.message);
  }
}

main().catch(console.error);
