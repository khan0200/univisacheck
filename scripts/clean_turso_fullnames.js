const path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'nuxt-app', 'node_modules', '@libsql', 'client'));

const TURSO_DATABASE_URL = 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io';
const TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg';

async function main() {
  const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
  console.log('Connected to Turso');

  try {
    const sRows = await db.execute('SELECT passport, "fullName", fullname FROM students');
    for (const r of sRows.rows) {
      const f1 = String(r.fullName || '');
      const f2 = String(r.fullname || '');
      const c1 = f1.replace(/\s+/g, ' ').trim();
      const c2 = f2.replace(/\s+/g, ' ').trim();
      if ((f1 && f1 !== c1) || (f2 && f2 !== c2)) {
        console.log(`Cleaning Turso student ${r.passport}: ${f1 || f2} -> ${c1 || c2}`);
        await db.execute({
          sql: 'UPDATE students SET "fullName" = ?, fullname = ? WHERE passport = ?',
          args: [c1 || c2, c1 || c2, r.passport]
        });
      }
    }
  } catch (e) {
    console.log('Turso students error:', e.message);
  }

  try {
    const mRows = await db.execute('SELECT passport, fullname FROM bot_manual_refreshes');
    for (const r of mRows.rows) {
      const f = String(r.fullname || '');
      const c = f.replace(/\s+/g, ' ').trim();
      if (f && f !== c) {
        console.log(`Cleaning Turso bot_manual_refreshes ${r.passport}: ${f} -> ${c}`);
        await db.execute({
          sql: 'UPDATE bot_manual_refreshes SET fullname = ? WHERE passport = ?',
          args: [c, r.passport]
        });
      }
    }
  } catch (e) {
    console.log('Turso bot_manual_refreshes error:', e.message);
  }

  console.log('Turso cleaning complete');
}

main().catch(console.error);
