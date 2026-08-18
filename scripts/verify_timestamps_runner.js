import { Client } from 'ssh2';

const script = `async function check() {
  const pg = (await import('/www/wwwroot/salomkorea/nuxt-app/node_modules/pg/lib/index.js')).default;
  const pool = new pg.Pool({ connectionString: 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db' });
  
  // Fetch students for admin (userId = 1)
  const { rows } = await pool.query('SELECT passport, "fullName", "lastChecked", status FROM students WHERE "userId" = 1 AND passport IN (\\'FB1291661\\', \\'FB2442582\\', \\'FB2440210\\', \\'FB2590045\\')');
  console.log('Pending students current timestamps in PostgreSQL:');
  for (const r of rows) {
    const diffMin = Math.round((Date.now() - new Date(r.lastChecked).getTime()) / 60000);
    console.log(r.passport, r.fullName, 'lastChecked:', r.lastChecked, '-> ' + diffMin + ' min. ago');
  }
  await pool.end();
}

check().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream('/www/wwwroot/salomkorea/scripts/verify_ui_timestamps.js');
    ws.write(script);
    ws.end();
    ws.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; node /www/wwwroot/salomkorea/scripts/verify_ui_timestamps.js', (e, stream) => {
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
