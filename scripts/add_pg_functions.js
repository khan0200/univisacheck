import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'
});

const functionsSql = `
CREATE OR REPLACE FUNCTION datetime(t text DEFAULT 'now') RETURNS timestamptz AS $$
BEGIN
  RETURN CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION datetime(t text, delta text) RETURNS timestamptz AS $$
BEGIN
  IF delta LIKE '+%seconds' THEN
    RETURN CURRENT_TIMESTAMP + (regexp_replace(delta, '[^0-9]', '', 'g')::integer * INTERVAL '1 second');
  ELSIF delta LIKE '-%seconds' THEN
    RETURN CURRENT_TIMESTAMP - (regexp_replace(delta, '[^0-9]', '', 'g')::integer * INTERVAL '1 second');
  ELSIF delta LIKE '+%minutes' THEN
    RETURN CURRENT_TIMESTAMP + (regexp_replace(delta, '[^0-9]', '', 'g')::integer * INTERVAL '1 minute');
  ELSIF delta LIKE '-%minutes' THEN
    RETURN CURRENT_TIMESTAMP - (regexp_replace(delta, '[^0-9]', '', 'g')::integer * INTERVAL '1 minute');
  ELSIF delta LIKE '+%days' THEN
    RETURN CURRENT_TIMESTAMP + (regexp_replace(delta, '[^0-9]', '', 'g')::integer * INTERVAL '1 day');
  ELSIF delta LIKE '-%days' THEN
    RETURN CURRENT_TIMESTAMP - (regexp_replace(delta, '[^0-9]', '', 'g')::integer * INTERVAL '1 day');
  ELSE
    RETURN CURRENT_TIMESTAMP;
  END IF;
END;
$$ LANGUAGE plpgsql;
`;

async function main() {
  console.log('Adding datetime compatibility functions to PostgreSQL...');
  await pool.query(functionsSql);
  const testRes = await pool.query("SELECT datetime('now') as now_time, datetime('now', '-5 minutes') as five_min_ago;");
  console.log('Test result:', testRes.rows[0]);
  await pool.end();
  console.log('Done!');
}

main().catch(console.error);
