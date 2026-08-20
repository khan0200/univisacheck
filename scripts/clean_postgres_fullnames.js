const path = require('path');
const pg = require(path.join(__dirname, '..', 'nuxt-app', 'node_modules', 'pg'));
const { Client } = pg;

const DATABASE_URL = 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to PostgreSQL');

  // Check columns of students table
  const sCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'students'
  `);
  console.log('Students columns:', sCols.rows.map(r => r.column_name));

  // Find students with extra spaces in fullname or "fullName"
  const sRows = await client.query(`
    SELECT passport, fullname, "fullName" 
    FROM students 
    WHERE (fullname ~ '\\s{2,}' OR "fullName" ~ '\\s{2,}' OR fullname != TRIM(fullname) OR "fullName" != TRIM("fullName"))
  `);
  console.log(`\n=== Students with extra spaces (${sRows.rows.length}) ===`);
  console.log(sRows.rows);

  // Find bot_manual_refreshes with extra spaces
  const mRows = await client.query(`
    SELECT passport, fullname 
    FROM bot_manual_refreshes 
    WHERE (fullname ~ '\\s{2,}' OR fullname != TRIM(fullname))
  `);
  console.log(`\n=== Bot manual refreshes with extra spaces (${mRows.rows.length}) ===`);
  console.log(mRows.rows);

  // Find visa_calc_leads with extra spaces
  const lRows = await client.query(`
    SELECT id, full_name 
    FROM visa_calc_leads 
    WHERE (full_name ~ '\\s{2,}' OR full_name != TRIM(full_name))
  `);
  console.log(`\n=== Visa calc leads with extra spaces (${lRows.rows.length}) ===`);
  console.log(lRows.rows);

  // All student fullnames sample
  const allStudents = await client.query(`SELECT passport, fullname, "fullName" FROM students LIMIT 20`);
  console.log('\n=== Sample 20 students from DB ===');
  console.log(allStudents.rows);

  await client.end();
}

main().catch(console.error);
