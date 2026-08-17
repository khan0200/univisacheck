import pg from '../nuxt-app/node_modules/pg/lib/index.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db'
});

async function main() {
  console.log('=== BEFORE CLEANUP ===');
  const beforeJobs = await pool.query('SELECT status, count(*) as c FROM visa_check_jobs GROUP BY status');
  console.log('Jobs:', beforeJobs.rows);
  const beforeTasks = await pool.query('SELECT status, count(*) as c FROM visa_check_tasks GROUP BY status');
  console.log('Tasks:', beforeTasks.rows);

  console.log('\nCleaning up historical queues...');

  // 1. Cancel all old stale jobs created more than 2 hours ago
  const cancelOldJobs = await pool.query(`
    UPDATE visa_check_jobs
    SET status = 'cancelled', "updatedAt" = NOW()
    WHERE status IN ('queued', 'processing')
      AND "createdAt" < NOW() - INTERVAL '2 hours'
  `);
  console.log(`Cancelled ${cancelOldJobs.rowCount} old stale jobs (> 2 hours old).`);

  // 2. For each user, keep only the single newest active manual job, cancel any older active manual jobs
  const cancelDuplicateJobs = await pool.query(`
    UPDATE visa_check_jobs
    SET status = 'cancelled', "updatedAt" = NOW()
    WHERE status IN ('queued', 'processing')
      AND check_source = 'manual'
      AND id NOT IN (
        SELECT DISTINCT ON ("userId") id
        FROM visa_check_jobs
        WHERE status IN ('queued', 'processing') AND check_source = 'manual'
        ORDER BY "userId", "createdAt" DESC
      )
  `);
  console.log(`Cancelled ${cancelDuplicateJobs.rowCount} duplicate older manual jobs.`);

  // 3. Cancel all tasks belonging to cancelled, completed, or failed jobs
  const cancelOrphanTasks = await pool.query(`
    UPDATE visa_check_tasks
    SET status = 'cancelled', "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = NOW()
    WHERE status IN ('queued', 'processing')
      AND "jobId" IN (
        SELECT id FROM visa_check_jobs WHERE status NOT IN ('queued', 'processing')
      )
  `);
  console.log(`Cancelled ${cancelOrphanTasks.rowCount} tasks belonging to finished/cancelled jobs.`);

  // 4. Cancel all stale processing tasks stuck for > 15 minutes
  const cancelStaleProcessing = await pool.query(`
    UPDATE visa_check_tasks
    SET status = 'cancelled', "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = NOW()
    WHERE status = 'processing'
      AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '15 minutes')
  `);
  console.log(`Cancelled ${cancelStaleProcessing.rowCount} stale processing tasks.`);

  // 5. Update progress counts and status on any remaining active jobs
  const activeJobs = await pool.query(`
    SELECT id, total FROM visa_check_jobs WHERE status IN ('queued', 'processing')
  `);
  for (const job of activeJobs.rows) {
    const countsRes = await pool.query(`
      SELECT status, count(*) as c FROM visa_check_tasks WHERE "jobId" = $1 GROUP BY status
    `, [job.id]);
    const counts = { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const r of countsRes.rows) {
      counts[r.status] = Number(r.c);
    }
    if (counts.queued === 0 && counts.processing === 0) {
      const finalStatus = counts.completed === Number(job.total) ? 'completed' : (counts.cancelled > 0 ? 'cancelled' : 'failed');
      await pool.query(`UPDATE visa_check_jobs SET status = $1, "updatedAt" = NOW() WHERE id = $2`, [finalStatus, job.id]);
      console.log(`Updated finished job ${job.id} -> ${finalStatus}`);
    }
  }

  console.log('\n=== AFTER CLEANUP ===');
  const afterJobs = await pool.query('SELECT status, count(*) as c FROM visa_check_jobs GROUP BY status');
  console.log('Jobs:', afterJobs.rows);
  const afterTasks = await pool.query('SELECT status, count(*) as c FROM visa_check_tasks GROUP BY status');
  console.log('Tasks:', afterTasks.rows);

  await pool.end();
}

main().catch(console.error);
