import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const conn = new Client();
const localFile = path.resolve('scripts/migrate_turso_to_postgres.js');

console.log('Connecting to VPS to run full Turso -> PostgreSQL migration...');

conn.on('ready', () => {
  console.log('Connected! Uploading migration script via SFTP to nuxt-app/scripts...');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const remotePath = '/www/wwwroot/salomkorea/nuxt-app/scripts/migrate_turso_to_postgres.js';
    const readStream = fs.createReadStream(localFile);
    const writeStream = sftp.createWriteStream(remotePath);

    readStream.pipe(writeStream);
    writeStream.on('close', () => {
      console.log('Upload completed! Installing pg and running migration...\n');
      const cmd = 'export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH && cd /www/wwwroot/salomkorea/nuxt-app && npm install pg && node scripts/migrate_turso_to_postgres.js';

      conn.exec(cmd, (execErr, stream) => {
        if (execErr) throw execErr;
        stream.on('data', (d) => process.stdout.write(d.toString()));
        stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
          console.log(`\nMigration process finished with exit code: ${code}`);
          conn.end();
        });
      });
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
