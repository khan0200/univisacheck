import { Client } from 'ssh2';

const conn = new Client();

const script = `
import pg from '/var/www/salomkorea/salomkorea-nuxt/node_modules/pg/lib/index.js';

const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });

async function run() {
  const student = await pool.query('SELECT passport, status, "applicationDate", "lastChecked" FROM students WHERE passport = \\'FA8686092\\'');
  console.log('Student in DB:', student.rows[0]);

  const tasks = await pool.query('SELECT id, "jobId", status, attempts, error, "createdAt", "updatedAt" FROM visa_check_tasks WHERE passport = \\'FA8686092\\' ORDER BY "createdAt" DESC LIMIT 5');
  console.log('Tasks for FA8686092:', tasks.rows);

  const jobs = await pool.query('SELECT * FROM visa_check_jobs ORDER BY "createdAt" DESC LIMIT 5');
  console.log('Recent 5 jobs:', jobs.rows);

  await pool.end();
}

run().catch(console.error);
`;

conn.on('ready', () => {
  console.log('✅ Connected to VPS. Running diagnostic...\n');
  const command = `export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/www/server/nvm/versions/node/v24.19.0/bin:$PATH; cat << 'EOF' > /tmp/test_diag.mjs\n${script}\nEOF\nnode /tmp/test_diag.mjs && rm -f /tmp/test_diag.mjs`;
  
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', code => {
      console.log(`\nProcess exited with code ${code}`);
      conn.end();
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
