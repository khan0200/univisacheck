import { Client } from 'ssh2';
import fs from 'node:fs';

const envContent = fs.readFileSync('c:/Users/User/Desktop/univisacheck/nuxt-app/.env', 'utf8');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to VPS. Uploading .env to all relevant directories...');
  conn.sftp((err, sftp) => {
    if (err) throw err;

    // 1. Write root .env
    const ws1 = sftp.createWriteStream('/www/wwwroot/salomkorea/.env');
    ws1.write(envContent);
    ws1.end();

    // 2. Write nuxt-app .env
    const ws2 = sftp.createWriteStream('/www/wwwroot/salomkorea/nuxt-app/.env');
    ws2.write(envContent);
    ws2.end();

    // 3. Write .output/server .env
    const ws3 = sftp.createWriteStream('/www/wwwroot/salomkorea/nuxt-app/.output/server/.env');
    ws3.write(envContent);
    ws3.end();

    ws3.on('close', () => {
      console.log('.env uploaded everywhere. Restarting PM2 with new env...');
      conn.exec('export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH; cd /www/wwwroot/salomkorea/nuxt-app && pm2 delete salomkorea || true; pm2 start ecosystem.config.cjs && pm2 save', (e, stream) => {
        if (e) throw e;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => {
          console.log(`PM2 restart finished with code ${code}`);
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
