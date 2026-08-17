const path = require('path');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '.env') });
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch {}

module.exports = {
  apps: [
    {
      name: 'salomkorea',
      script: './.output/server/index.mjs',
      cwd: '/www/wwwroot/salomkorea/nuxt-app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
        NITRO_HOST: '0.0.0.0',
        NITRO_PORT: 3000,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://salomkorea_user:SalomKoreaPg2026SecurePass!@127.0.0.1:5432/salomkorea_db',
        JWT_SECRET: process.env.JWT_SECRET || 'visacheck-secret-key-2026-change-in-production',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8628603817:AAEDMIsRb0JRichfx_NmwhMszHpiNiUEI-4',
        ADMIN_SECRET: process.env.ADMIN_SECRET || 'visacheck-admin-secret-2026',
        BOT_ENCRYPTION_KEY: process.env.BOT_ENCRYPTION_KEY || 'default-bot-encryption-key-for-korea-visa-check',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
      }
    }
  ]
};
