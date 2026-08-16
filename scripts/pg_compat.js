import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@178.238.231.210:5432/salomkorea_db'
});

async function main() {
  // Wait, port 5432 on VPS is bound to localhost by default.
  // We can run this directly on VPS via SSH!
}
