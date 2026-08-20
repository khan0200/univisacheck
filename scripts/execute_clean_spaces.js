const path = require('path');
const pg = require(path.join(__dirname, '..', 'nuxt-app', 'node_modules', 'pg'));
const { Client } = pg;

const DATABASE_URL = 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to PostgreSQL');

  // 1. Clean `students` table
  const sRes = await client.query(`
    UPDATE students
    SET 
      "fullName" = REGEXP_REPLACE(TRIM("fullName"), '\\s+', ' ', 'g'),
      fullname = CASE WHEN fullname IS NOT NULL THEN REGEXP_REPLACE(TRIM(fullname), '\\s+', ' ', 'g') ELSE fullname END
    WHERE 
      ("fullName" ~ '\\s{2,}' OR "fullName" != TRIM("fullName"))
      OR (fullname IS NOT NULL AND (fullname ~ '\\s{2,}' OR fullname != TRIM(fullname)))
    RETURNING passport, "fullName", fullname
  `);
  console.log(`✅ Cleaned ${sRes.rowCount} rows in 'students':`, sRes.rows);

  // 2. Clean `bot_manual_refreshes` table
  const mRes = await client.query(`
    UPDATE bot_manual_refreshes
    SET 
      fullname = REGEXP_REPLACE(TRIM(fullname), '\\s+', ' ', 'g')
    WHERE 
      (fullname ~ '\\s{2,}' OR fullname != TRIM(fullname))
    RETURNING passport, fullname
  `);
  console.log(`✅ Cleaned ${mRes.rowCount} rows in 'bot_manual_refreshes':`, mRes.rows);

  // 3. Clean `visa_calc_leads` table if any
  try {
    const lRes = await client.query(`
      UPDATE visa_calc_leads
      SET 
        full_name = REGEXP_REPLACE(TRIM(full_name), '\\s+', ' ', 'g')
      WHERE 
        full_name ~ '\\s{2,}' OR full_name != TRIM(full_name)
      RETURNING id, full_name
    `);
    console.log(`✅ Cleaned ${lRes.rowCount} rows in 'visa_calc_leads':`, lRes.rows);
  } catch (e) {
    console.log('visa_calc_leads update note:', e.message);
  }

  // 4. Verify no extra spaces remain
  const checkS = await client.query(`
    SELECT passport, "fullName", fullname 
    FROM students 
    WHERE "fullName" ~ '\\s{2,}' OR (fullname IS NOT NULL AND fullname ~ '\\s{2,}')
  `);
  const checkM = await client.query(`
    SELECT passport, fullname 
    FROM bot_manual_refreshes 
    WHERE fullname ~ '\\s{2,}'
  `);

  console.log('\n--- VERIFICATION ---');
  console.log('Remaining students with double spaces:', checkS.rows.length);
  console.log('Remaining bot_manual_refreshes with double spaces:', checkM.rows.length);

  await client.end();
  console.log('Done!');
}

main().catch(console.error);
