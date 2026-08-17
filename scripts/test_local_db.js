import { getTursoClient } from '../nuxt-app/server/utils/turso.ts';

async function test() {
  console.log('Testing getTursoClient()...');
  const db = await getTursoClient();
  const res = await db.execute('SELECT count(*) as count FROM users');
  console.log('Success! Users count:', res.rows);
  const authTest = await db.execute({
    sql: 'SELECT id, email, username FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?',
    args: ['unibridge', 'unibridge']
  });
  console.log('Unibridge query result:', authTest.rows);
}

test().catch(console.error);
