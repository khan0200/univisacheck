import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const conn = new Client();
const localFile = path.resolve('scripts/add_pg_functions.js');

conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const remotePath = '/www/wwwroot/salomkorea/nuxt-app/scripts/add_pg_functions.js';
    const readStream = fs.createReadStream(localFile);
    const writeStream = sftp.createWriteStream(remotePath);

    readStream.pipe(writeStream);
    writeStream.on('close', () => {
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH && cd /www/wwwroot/salomkorea/nuxt-app && node scripts/add_pg_functions.js', (execErr, stream) => {
        if (execErr) throw execErr;
        stream.on('data', (d) => process.stdout.write(d.toString()));
        stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
        stream.on('close', (code) => {
          console.log(`Add functions exited with code: ${code}`);
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
