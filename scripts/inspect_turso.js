import { createClient } from '@libsql/client';

const client = createClient({
  url: 'libsql://visachecking-khan0200.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5ODQ4NzQsImlkIjoiMDE5ZjFlZjEtMjUwMS03N2UyLWIxNWUtMjZhZmYyN2Y1NThiIiwia2lkIjoiVFZIaHctQ1VfMTczOVlqa2dZRGpKbGJfQlVpQWVLckxTelhfbDVMUTlzRSIsInJpZCI6IjYzMGRiOTQyLWY1ZGItNDlmMC1iOTg1LTcxM2U4ZWIxNjQzMyJ9.jGWCFnYHOz8gtFLxwRsXtlGwUvV0CskwYeTC1eqytioncQ5DeCxOMbN2Ydwe0sbyPyI3ZrCuvYt5udu4af8zAg'
});

async function main() {
  const tables = await client.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  console.log(`Found ${tables.rows.length} tables in Turso:\n`);
  for (const row of tables.rows) {
    const count = await client.execute(`SELECT count(*) as c FROM "${row.name}"`);
    console.log(`Table: ${row.name} (${count.rows[0].c} rows)`);
    console.log(`Schema:\n${row.sql}\n---`);
  }
}

main().catch(console.error);
