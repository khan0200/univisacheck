import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const nginxConf = `server {
    listen 80;
    server_name salomkorea.uz www.salomkorea.uz;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name salomkorea.uz www.salomkorea.uz;

    ssl_certificate /etc/letsencrypt/live/salomkorea.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/salomkorea.uz/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    location /.well-known/acme-challenge/ {
        root /www/wwwroot/salomkorea/nuxt-app/public;
    }

    # SSE / Realtime endpoint configuration
    location /api/realtime {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 60s;
        chunked_transfer_encoding off;
    }

    # Visa-check endpoints. These proxy synchronously to visa.go.kr (15-20s per
    # lookup) and the batch worker dispatches for minutes, so the default
    # location / read timeout was cutting the connection with a 504 while the
    # backend was still working — the browser hung with no result.
    location ~ ^/api/(jobs|check-status|download-visa-pdf) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        # Stream results back as they are produced rather than buffering the
        # whole response; also keeps progress logging responsive.
        proxy_buffering off;
        proxy_cache off;
        proxy_connect_timeout 75s;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 75s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    client_max_body_size 50M;
    access_log /www/wwwlogs/salomkorea.uz.log;
    error_log /www/wwwlogs/salomkorea.uz.error.log;
}
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to VPS. Writing Nginx config...');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const writeStream = sftp.createWriteStream('/www/server/panel/vhost/nginx/salomkorea.uz.conf');
    writeStream.write(nginxConf);
    writeStream.end();
    writeStream.on('close', () => {
      console.log('Nginx config written. Testing & reloading...');
      conn.exec('nginx -t && systemctl reload nginx || systemctl restart nginx', (execErr, stream) => {
        if (execErr) throw execErr;
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => {
          console.log(`Nginx reload completed with code ${code}`);
          conn.end();
        });
      });
    });
  });
});

// Credentials come from the environment — never hardcode them in a tracked file.
//   VPS_HOST=... VPS_USER=root VPS_PASSWORD=... node scripts/update_nginx.js
// Prefer key-based auth: set VPS_PRIVATE_KEY to the path of your private key.
const host = process.env.VPS_HOST;
const username = process.env.VPS_USER || 'root';
const password = process.env.VPS_PASSWORD;
const privateKeyPath = process.env.VPS_PRIVATE_KEY;

if (!host) {
  console.error('FATAL: set VPS_HOST (and VPS_PASSWORD or VPS_PRIVATE_KEY).');
  process.exit(1);
}
if (!password && !privateKeyPath) {
  console.error('FATAL: set either VPS_PASSWORD or VPS_PRIVATE_KEY.');
  process.exit(1);
}

conn.connect({
  host,
  port: Number(process.env.VPS_PORT || 22),
  username,
  ...(privateKeyPath
    ? { privateKey: readFileSync(privateKeyPath) }
    : { password })
});
