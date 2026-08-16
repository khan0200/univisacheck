import { Client } from 'ssh2';

const conn = new Client();

const setupScript = `
echo "=== 1. Installing PostgreSQL ==="
DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib

echo "=== 2. Starting & Enabling PostgreSQL Service ==="
systemctl enable postgresql
systemctl start postgresql

echo "=== 3. Creating Database and User ==="
sudo -u postgres psql -c "
DO \\$\\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'salomkorea_user') THEN
      CREATE ROLE salomkorea_user WITH LOGIN PASSWORD 'SalomKoreaPg2026SecurePass!';
   ELSE
      ALTER ROLE salomkorea_user WITH PASSWORD 'SalomKoreaPg2026SecurePass!';
   END IF;
END
\\$\\$;
"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'salomkorea_db'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE salomkorea_db OWNER salomkorea_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE salomkorea_db TO salomkorea_user;"
sudo -u postgres psql -d salomkorea_db -c "GRANT ALL ON SCHEMA public TO salomkorea_user;"

echo "=== 4. Verifying PostgreSQL Connection ==="
PGPASSWORD='SalomKoreaPg2026SecurePass!' psql -U salomkorea_user -h 127.0.0.1 -d salomkorea_db -c "SELECT version();"

echo "=== POSTGRESQL SETUP COMPLETED SUCCESSFULLY! ==="
`;

console.log('Connecting to VPS to install and configure PostgreSQL...');

conn.on('ready', () => {
  console.log('Connected! Executing PostgreSQL installation...');
  conn.exec(setupScript, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', (code) => {
      console.log(`\nScript exited with code: ${code}`);
      conn.end();
    });
  });
}).on('error', (err) => {
  console.error('SSH Error:', err.message);
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
