import { Client } from 'ssh2';

const script = `import pg from '/www/wwwroot/salomkorea/nuxt-app/node_modules/pg/lib/index.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db'
});

async function main() {
  const users = await pool.query('SELECT id, email, username FROM users');
  console.log('Users in PG:', users.rows);

  const students = await pool.query('SELECT passport, "fullName", "userId" FROM students LIMIT 10');
  console.log('Sample students and their userIds:', students.rows);

  await pool.end();
}

main().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/check_users.js');
    ws.write(script);
    ws.end();
    ws.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/check_users.js', (e, stream) => {
        if (e) throw e;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => {
          conn.end();
        });
      });
    });
  });
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
