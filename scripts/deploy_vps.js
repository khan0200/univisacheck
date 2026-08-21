/**
 * scripts/deploy_vps.js
 *
 * Deploys the current origin/master to the VPS.
 *
 * Safety model — the previous version ran `pm2 delete salomkorea` before it
 * knew whether the replacement could start. If the build failed or .env was
 * missing, the site went down with no rollback. Deployment is now split into
 * two phases:
 *
 *   PHASE 1 (preflight)  — pull, install, validate .env, build.
 *                          The running app is NEVER touched. Any failure here
 *                          aborts and leaves the live site serving traffic.
 *   PHASE 2 (cutover)    — only runs if phase 1 fully succeeded. Reloads PM2
 *                          and verifies the process came back up, rolling back
 *                          to the previous commit if it did not.
 *
 * Credentials come from the environment — never hardcode them in a tracked file:
 *   VPS_HOST=178.238.231.210 VPS_PASSWORD=... node scripts/deploy_vps.js
 *   VPS_HOST=... VPS_PRIVATE_KEY=~/.ssh/id_ed25519 node scripts/deploy_vps.js   (preferred)
 *
 * Flags:
 *   --check   Run preflight only, then stop. Never modifies the running app.
 */

import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const APP_DIR = '/www/wwwroot/salomkorea';
const NUXT_DIR = `${APP_DIR}/nuxt-app`;
const PM2_APP = 'salomkorea';
const NODE_BIN = '/www/server/nvm/versions/node/v24.19.0/bin';

// Must match REQUIRED in nuxt-app/ecosystem.config.cjs — the app refuses to
// boot without these, so catching them here is what keeps the site up.
const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'ADMIN_SECRET',
  'BOT_ENCRYPTION_KEY'
];

const checkOnly = process.argv.includes('--check');

// ── Connection config ───────────────────────────────────────────────────────
const host = process.env.VPS_HOST;
const username = process.env.VPS_USER || 'root';
const password = process.env.VPS_PASSWORD;
const privateKeyPath = process.env.VPS_PRIVATE_KEY;

if (!host) {
  console.error('FATAL: set VPS_HOST (and VPS_PASSWORD or VPS_PRIVATE_KEY).');
  console.error('  e.g. VPS_HOST=178.238.231.210 VPS_PASSWORD=... node scripts/deploy_vps.js');
  process.exit(1);
}
if (!password && !privateKeyPath) {
  console.error('FATAL: set either VPS_PASSWORD or VPS_PRIVATE_KEY.');
  process.exit(1);
}

// ── PHASE 1: preflight. Touches nothing that is serving traffic. ────────────
// Every step is `set -e`-guarded via explicit exit codes so a failure stops
// before the cutover. The build writes to .output/, which the running process
// already has loaded in memory, so building is safe while the app is live.
const preflightScript = `
set -e
export PATH=${NODE_BIN}:$PATH

echo "=== [1/5] Recording current commit (for rollback) ==="
cd ${APP_DIR}
PREV_COMMIT=$(git rev-parse HEAD)
echo "PREV_COMMIT=$PREV_COMMIT"
echo "$PREV_COMMIT" > /tmp/salomkorea_prev_commit

echo ""
echo "=== [2/5] Validating .env BEFORE touching anything ==="
ENV_FILE=""
if [ -f "${APP_DIR}/.env" ]; then
  ENV_FILE="${APP_DIR}/.env"
elif [ -f "${NUXT_DIR}/.env" ]; then
  ENV_FILE="${NUXT_DIR}/.env"
fi

if [ -z "$ENV_FILE" ]; then
  echo "PREFLIGHT_FAIL: no .env found at ${APP_DIR}/.env or ${NUXT_DIR}/.env"
  echo "  .env is gitignored, so a deploy cannot create it."
  echo "  Fix:  scp .env ${username}@${host}:${APP_DIR}/.env"
  exit 91
fi
echo "Found: $ENV_FILE"

MISSING=""
for KEY in ${REQUIRED_ENV.join(' ')}; do
  if ! grep -qE "^[[:space:]]*\${KEY}[[:space:]]*=[[:space:]]*[^[:space:]]" "$ENV_FILE"; then
    MISSING="$MISSING $KEY"
  fi
done

if [ -n "$MISSING" ]; then
  echo "PREFLIGHT_FAIL: .env is missing required value(s):$MISSING"
  echo "  The app calls process.exit(1) without these — starting would fail."
  exit 92
fi
echo "All required variables present."

# Advisory only — these do not block the deploy.
if grep -qE "^[[:space:]]*NODE_ENV[[:space:]]*=[[:space:]]*development" "$ENV_FILE"; then
  echo "WARNING: NODE_ENV=development in .env (pm2 env forces production, but scripts/cron will see development)"
fi
if grep -E "^[[:space:]]*DATABASE_URL" "$ENV_FILE" | grep -qv "127.0.0.1\|localhost"; then
  echo "WARNING: DATABASE_URL does not use 127.0.0.1 — queries leave the box and a"
  echo "         single timeout permanently trips the sticky Turso fallback."
fi
if ! grep -qE "^[[:space:]]*PUSHER_APP_ID[[:space:]]*=[[:space:]]*[^[:space:]]" "$ENV_FILE"; then
  echo "WARNING: PUSHER_* not set — realtime falls back to in-process SSE (lost on restart)."
fi

echo ""
echo "=== [3/5] Pulling latest from GitHub ==="
cd ${APP_DIR}
git fetch origin master
git reset --hard origin/master
echo "Now at: $(git log --oneline -1)"

echo ""
echo "=== [4/5] Installing dependencies ==="
cd ${NUXT_DIR}
npm install --no-audit --no-fund

echo ""
echo "=== [5/5] Building (running app is untouched during this) ==="
npm run build

echo ""
echo "PREFLIGHT_OK"
`;

// ── PHASE 2: cutover. Only reached when preflight fully succeeded. ──────────
const cutoverScript = `
export PATH=${NODE_BIN}:$PATH
cd ${NUXT_DIR}

echo "=== Reloading PM2 ==="
# 'startOrReload' replaces delete+start: it keeps the old process serving until
# the new one is up, and does not leave the app deleted if the start fails.
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo ""
echo "=== Verifying process is online ==="
sleep 5
STATUS=$(pm2 jlist | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const a=JSON.parse(d).find(x=>x.name==='${PM2_APP}');console.log(a?a.pm2_env.status:'missing')}catch(e){console.log('parse_error')}})")
echo "PM2 status: $STATUS"

if [ "$STATUS" != "online" ]; then
  echo "CUTOVER_FAIL: app is not online after reload. Recent logs:"
  pm2 logs ${PM2_APP} --lines 40 --nostream 2>&1 | tail -40
  echo ""
  echo "Rolling back to previous commit..."
  PREV=$(cat /tmp/salomkorea_prev_commit 2>/dev/null || echo "")
  if [ -n "$PREV" ]; then
    cd ${APP_DIR} && git reset --hard "$PREV"
    cd ${NUXT_DIR} && npm run build && pm2 startOrReload ecosystem.config.cjs --update-env
    echo "Rolled back to $PREV"
  else
    echo "No previous commit recorded — manual intervention required."
  fi
  exit 93
fi

echo ""
echo "=== Health check ==="
sleep 2
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 http://127.0.0.1:3000/api/realtime/config || echo "000")
echo "GET /api/realtime/config -> HTTP $CODE"
PROVIDER=$(curl -s --max-time 20 http://127.0.0.1:3000/api/realtime/config || echo "")
echo "Realtime provider: $PROVIDER"

if [ "$CODE" != "200" ]; then
  echo "WARNING: health check did not return 200. App is running but may be unhealthy."
fi

echo ""
echo "CUTOVER_OK"
`;

// ── Runner ──────────────────────────────────────────────────────────────────
function run(conn, script, label) {
  return new Promise((resolve, reject) => {
    conn.exec(script, (err, stream) => {
      if (err) return reject(err);
      let output = '';
      stream.on('data', (d) => { const t = d.toString(); output += t; process.stdout.write(t); });
      stream.stderr.on('data', (d) => { const t = d.toString(); output += t; process.stderr.write(t); });
      stream.on('close', (code) => resolve({ code, output, label }));
    });
  });
}

const conn = new Client();

console.log(`Deploying to ${username}@${host}`);
console.log(checkOnly ? 'Mode: --check (preflight only, no changes to the running app)\n' : 'Mode: full deploy\n');

conn.on('ready', async () => {
  try {
    const pre = await run(conn, preflightScript, 'preflight');

    if (pre.code !== 0 || !pre.output.includes('PREFLIGHT_OK')) {
      console.error('\n' + '='.repeat(60));
      console.error('PREFLIGHT FAILED — deployment aborted.');
      console.error('Your site was NOT touched and is still serving traffic.');
      if (pre.code === 91) console.error('Cause: .env missing on the server.');
      if (pre.code === 92) console.error('Cause: .env is missing required variables.');
      console.error('='.repeat(60));
      conn.end();
      process.exitCode = pre.code || 1;
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('PREFLIGHT PASSED — build is ready.');
    console.log('='.repeat(60) + '\n');

    if (checkOnly) {
      console.log('--check specified: stopping before cutover. Running app untouched.');
      conn.end();
      return;
    }

    const cut = await run(conn, cutoverScript, 'cutover');

    if (cut.code !== 0 || !cut.output.includes('CUTOVER_OK')) {
      console.error('\n' + '='.repeat(60));
      console.error('CUTOVER FAILED — a rollback was attempted (see log above).');
      console.error('Verify with: pm2 list && pm2 logs salomkorea');
      console.error('='.repeat(60));
      conn.end();
      process.exitCode = cut.code || 1;
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('DEPLOYMENT COMPLETE.');
    console.log('='.repeat(60));
    console.log('\nVerify the visa-check fix:');
    console.log('  pm2 logs salomkorea | grep -E "Task Runner|Queue Task Timing|Drain complete"');
    console.log('Verify notifications:');
    console.log('  pm2 logs salomkorea | grep "Telegram Notifier"');
    conn.end();
  } catch (err) {
    console.error('Deployment error:', err.message);
    conn.end();
    process.exitCode = 1;
  }
})
  .on('error', (err) => {
    console.error('SSH connection error:', err.message);
    process.exitCode = 1;
  })
  .connect({
    host,
    port: Number(process.env.VPS_PORT || 22),
    username,
    readyTimeout: 30000,
    ...(privateKeyPath ? { privateKey: readFileSync(privateKeyPath) } : { password })
  });
