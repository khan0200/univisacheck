import { Client } from 'ssh2';

const conn = new Client();

const deployCommand = `
export PATH=/www/server/nvm/versions/node/v24.19.0/bin:$PATH
echo "=== 1. Pulling latest changes from GitHub ==="
cd /www/wwwroot/salomkorea && git fetch origin master && git reset --hard origin/master
echo "=== 2. Installing dependencies ==="
cd /www/wwwroot/salomkorea/nuxt-app && npm install
echo "=== 3. Building Nuxt production app ==="
npm run build
echo "=== 4. Reloading PM2 ==="
pm2 delete salomkorea || true
pm2 start ecosystem.config.cjs
pm2 save
echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY! ==="
`;

console.log('🚀 Starting deployment to Contabo VPS (178.238.231.210)...');

conn.on('ready', () => {
  console.log('✅ Connected via SSH. Running deployment steps on server...\n');
  conn.exec(deployCommand, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', (code) => {
      if (code === 0) {
        console.log('\n🎉 ALL DONE! Your site is live on VPS with PostgreSQL.');
      } else {
        console.error(`\n❌ Deployment failed with exit code: ${code}`);
      }
      conn.end();
    });
  });
}).on('error', (err) => {
  console.error('❌ SSH Connection error:', err.message);
}).connect({
  host: '178.238.231.210',
  port: 22,
  username: 'root',
  password: 'SalomKorea2026!'
});
