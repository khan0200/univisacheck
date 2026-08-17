import * as directVisaCheck from '../nuxt-app/server/lib/direct-visa-check.js';
import pg from '../nuxt-app/node_modules/pg/lib/index.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db'
});

async function run() {
  const studentsRes = await pool.query(`
    SELECT passport, "fullName", fullname, birthday, "visaType", visa_type, "applicationNo", application_no 
    FROM students
    WHERE "deletedAt" IS NULL AND "batchSelected" = 1
  `);

  console.log(`Testing all ${studentsRes.rows.length} students with persistent session and sequential 2-stream...`);
  const queue = [...studentsRes.rows];
  const CONCURRENCY = 3;
  let ok = 0;
  let fail = 0;

  async function worker() {
    while (queue.length > 0) {
      const s = queue.shift();
      if (!s) break;
      try {
        const res = await directVisaCheck.checkVisaDirect(
          s.passport,
          s.fullName || s.fullname || '',
          s.birthday || '',
          s.visaType || s.visa_type || 'Embassy',
          s.applicationNo || s.application_no || ''
        );
        ok++;
        console.log(`✅ [${ok}/${studentsRes.rows.length}] ${s.passport} (${s.fullName}): ${res.latestStatus}`);
      } catch (err) {
        fail++;
        console.error(`❌ ${s.passport} error:`, err.message);
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const start = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const dur = (Date.now() - start) / 1000;

  console.log(`\n🎉 Final result: ${ok} OK, ${fail} Failed out of ${studentsRes.rows.length} in ${dur}s!`);
  await pool.end();
}

run().catch(console.error);
