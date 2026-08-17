import pg from '../nuxt-app/node_modules/pg/lib/index.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db'
});

async function main() {
  const activeJobs = await pool.query(`
    SELECT id, "userId", total, status, check_source, "createdAt", "updatedAt"
    FROM visa_check_jobs
    WHERE status IN ('queued', 'processing')
    ORDER BY "createdAt" ASC
  `);
  console.log(`Active jobs (${activeJobs.rows.length}):`);
  for (const j of activeJobs.rows) {
    console.log(`Job ${j.id} | User ${j.userId} | total ${j.total} | status ${j.status} | source ${j.check_source} | created ${j.createdAt}`);
  }

  const processingTasks = await pool.query(`
    SELECT id, "jobId", passport, "userId", status, "lockedAt", "lockedBy", attempts, "createdAt"
    FROM visa_check_tasks
    WHERE status = 'processing'
    ORDER BY "createdAt" ASC
    LIMIT 20
  `);
  console.log(`\nSample Processing Tasks (${processingTasks.rows.length}):`);
  for (const t of processingTasks.rows) {
    console.log(`Task ${t.id} | Job ${t.jobId} | ${t.passport} | lockedAt: ${t.lockedAt} | lockedBy: ${t.lockedBy} | created: ${t.createdAt}`);
  }

  await pool.end();
}

main().catch(console.error);
