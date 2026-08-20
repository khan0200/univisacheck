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
  const res = await db.execute({
    sql: 'SELECT passport, fullName, status, lastChecked, check_source, userId, visaType, applicationNo, deletedAt FROM students WHERE passport = ?',
    args: ['FA0135684']
  });
  console.log('Students found:', JSON.stringify(res.rows, null, 2));

  const notifs = await db.execute({
    sql: 'SELECT * FROM notifications WHERE student_id = ? ORDER BY id DESC LIMIT 10',
    args: ['FA0135684']
  });
  console.log('Recent notifications for FA0135684:', JSON.stringify(notifs.rows, null, 2));

  const recentNotifs = await db.execute({
    sql: 'SELECT * FROM notifications ORDER BY id DESC LIMIT 10'
  });
  console.log('All recent notifications:', JSON.stringify(recentNotifs.rows, null, 2));

  const tasks = await db.execute({
    sql: 'SELECT * FROM visa_check_tasks WHERE passport = ? ORDER BY createdAt DESC LIMIT 5',
    args: ['FA0135684']
  });
  console.log('Recent tasks for FA0135684:', JSON.stringify(tasks.rows, null, 2));
}

main().catch(console.error);
